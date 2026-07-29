import type { DataSource } from "./datasource.js";
import { withinWindow } from "./datasource.js";
import type { UsageRecord } from "./types.js";
import { costFor } from "./pricing.js";

/**
 * SyntheticDataSource — the default, zero-dependency source.
 *
 * Generates ~14 days of fictional usage on server start. It is
 * deterministic-but-randomized: dates are anchored to "today" so the demo
 * always looks fresh, while every value is produced by a seeded PRNG keyed on
 * (date, agent, request index), so the same calendar day always yields the
 * same numbers across runs.
 *
 * All names are invented (no real companies/teams) since this data may appear
 * in a public submission.
 */

const DAYS = 14;

/** Deterministic day the spike lands on: N days before the end of the window. */
const SPIKE_DAYS_BEFORE_END = 4;
const SPIKE_AGENT = "clustering-monitor";
const SPIKE_MULTIPLIER = 6;

interface AgentSpec {
  agent_name: string;
  team: string;
  /** Typical requests per day (before jitter). */
  baseRequestsPerDay: number;
  /** Model id -> selection weight. Weights need not sum to 1. */
  modelWeights: Record<string, number>;
  /** Prompt token range [min, max]. */
  promptTokenRange: [number, number];
  /** Completion token range [min, max]. */
  completionTokenRange: [number, number];
  /** Sample prompt lines this agent tends to send (used for previews). */
  prompts: string[];
  /**
   * Team members who use this agent, most-active first. Each request is
   * attributed to one of them (front-loaded so there's a clear top spender).
   * All names are invented.
   */
  members: string[];
}

const AGENTS: AgentSpec[] = [
  {
    agent_name: "clustering-monitor",
    team: "Team Nebula",
    baseRequestsPerDay: 40,
    modelWeights: { "claude-haiku-4-5": 0.7, "claude-sonnet-5": 0.25, "claude-opus-4-8": 0.05 },
    promptTokenRange: [400, 2500],
    completionTokenRange: [200, 1200],
    prompts: [
      "Analyze the latest cluster health metrics and flag any nodes drifting from baseline utilization over the past hour",
      "Summarize anomalous CPU spikes across the monitoring fleet and correlate them with recent deploy events",
      "Given these Prometheus series, identify which pods are approaching their memory limits and rank by risk",
    ],
    members: ["Ava Chen", "Noah Kim"],
  },
  {
    agent_name: "sales-copilot",
    team: "Team Nebula",
    baseRequestsPerDay: 90,
    modelWeights: { "claude-haiku-4-5": 0.5, "claude-sonnet-5": 0.45, "claude-opus-4-8": 0.05 },
    promptTokenRange: [300, 1800],
    completionTokenRange: [200, 900],
    prompts: [
      "Draft a follow-up email to a prospect who attended last week's demo but hasn't replied to pricing questions",
      "Summarize this discovery call transcript into next steps, risks, and the champion's stated priorities",
      "Write three subject-line variants for a re-engagement campaign targeting dormant enterprise accounts",
    ],
    members: ["Liam Reyes", "Grace Park", "Ava Chen"],
  },
  {
    agent_name: "support-bot",
    team: "Team Falcon",
    baseRequestsPerDay: 160,
    modelWeights: { "claude-haiku-4-5": 0.85, "claude-sonnet-5": 0.14, "claude-opus-4-8": 0.01 },
    promptTokenRange: [200, 1200],
    completionTokenRange: [100, 600],
    prompts: [
      "Customer reports the export button returns a 500 error intermittently; suggest troubleshooting steps",
      "Explain in plain language why the invoice total differs from the quoted amount for this subscription",
      "Triage this bug report and decide whether it should be escalated to engineering or resolved from the KB",
    ],
    members: ["Mia Torres", "Diego Flores", "Ethan Novak"],
  },
  {
    agent_name: "deck-generator",
    team: "Team Orbit",
    baseRequestsPerDay: 18,
    modelWeights: { "claude-haiku-4-5": 0.15, "claude-sonnet-5": 0.45, "claude-opus-4-8": 0.4 },
    promptTokenRange: [1500, 9000],
    completionTokenRange: [1500, 5000],
    prompts: [
      "Generate a 20-slide investor deck for a Series B fintech, including market sizing and a competitive matrix",
      "Rewrite this rough outline into a polished board presentation with speaker notes for each slide",
      "Produce an executive summary slide plus three appendix slides from the attached quarterly metrics",
    ],
    members: ["Sofia Ruiz", "Owen Blake"],
  },
  {
    agent_name: "code-reviewer",
    team: "Team Quasar",
    baseRequestsPerDay: 55,
    modelWeights: { "claude-haiku-4-5": 0.3, "claude-sonnet-5": 0.6, "claude-opus-4-8": 0.1 },
    promptTokenRange: [800, 6000],
    completionTokenRange: [300, 2000],
    prompts: [
      "Review this pull request for correctness, race conditions, and missing test coverage; be specific",
      "Explain the security implications of this authentication change and suggest safer alternatives",
      "Assess whether this refactor preserves behavior and point out any edge cases the diff misses",
    ],
    members: ["Priya Nair", "Marcus Lee", "Hana Sato"],
  },
];

// ---- deterministic PRNG -------------------------------------------------

/** FNV-1a 32-bit string hash -> seed. */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: deterministic, seed -> generator of floats in [0,1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rand: number, weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let target = rand * total;
  for (const [model, w] of entries) {
    target -= w;
    if (target <= 0) return model;
  }
  return entries[entries.length - 1][0];
}

function intInRange(rand: number, [min, max]: [number, number]): number {
  return Math.floor(min + rand * (max - min + 1));
}

/**
 * Pick a team member, front-loaded so earlier members are more active
 * (weight = length - index). Gives each agent a clear "top spender".
 */
function pickMember(rand: number, members: string[]): string {
  const weights = members.map((_, i) => members.length - i);
  const total = weights.reduce((s, w) => s + w, 0);
  let target = rand * total;
  for (let i = 0; i < members.length; i++) {
    target -= weights[i];
    if (target <= 0) return members[i];
  }
  return members[members.length - 1];
}

/** YYYY-MM-DD for a Date in UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class SyntheticDataSource implements DataSource {
  readonly name = "synthetic";
  private readonly records: UsageRecord[];

  /**
   * @param endDate anchor for the most recent day of data (default: today,
   *   UTC). The window is [endDate - 13 days, endDate].
   */
  constructor(endDate: Date = new Date()) {
    this.records = generateRecords(endDate);
  }

  async getUsageRecords(startDate?: string, endDate?: string): Promise<UsageRecord[]> {
    return withinWindow(this.records, startDate, endDate);
  }
}

function generateRecords(endDate: Date): UsageRecord[] {
  const records: UsageRecord[] = [];
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - dayOffset);
    const dateStr = isoDate(day);
    // dayOffset === SPIKE_DAYS_BEFORE_END is the spike day.
    const isSpikeDay = dayOffset === SPIKE_DAYS_BEFORE_END;

    for (const agent of AGENTS) {
      const daySeed = mulberry32(hashSeed(`${dateStr}|${agent.agent_name}`));

      // Weekend dip: fewer requests on Sat/Sun for a bit of realism.
      const dow = day.getUTCDay();
      const weekendFactor = dow === 0 || dow === 6 ? 0.45 : 1;

      let requests = Math.round(
        agent.baseRequestsPerDay * weekendFactor * (0.8 + daySeed() * 0.4),
      );
      if (isSpikeDay && agent.agent_name === SPIKE_AGENT) {
        requests *= SPIKE_MULTIPLIER;
      }

      for (let i = 0; i < requests; i++) {
        const r = mulberry32(hashSeed(`${dateStr}|${agent.agent_name}|${i}`));
        const model = pickWeighted(r(), agent.modelWeights);
        const member = pickMember(r(), agent.members);
        const promptTokens = intInRange(r(), agent.promptTokenRange);
        const completionTokens = intInRange(r(), agent.completionTokenRange);
        const cost = costFor(model, promptTokens, completionTokens);

        // Spread requests across the working part of the day.
        const hour = 8 + Math.floor(r() * 12);
        const minute = Math.floor(r() * 60);
        const second = Math.floor(r() * 60);
        const ts = new Date(day);
        ts.setUTCHours(hour, minute, second, 0);

        const promptFull = agent.prompts[i % agent.prompts.length];
        records.push({
          timestamp: ts.toISOString(),
          team: agent.team,
          agent_name: agent.agent_name,
          member,
          model,
          cost_usd: cost,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          prompt_preview: promptFull.slice(0, 100),
        });
      }
    }
  }

  // Stable chronological order.
  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return records;
}
