import type { DataSource } from "./datasource.js";
import type { UsageRecord } from "./types.js";

/**
 * PrometheusDataSource — reads Archestra's LLM observability metrics via the
 * standard Prometheus HTTP API (`/api/v1/query_range`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STATUS: implemented against the documented Prometheus HTTP API, but NOT yet
 * verified against a live Archestra instance. The metric and label names below
 * come from Archestra's docs (`llm_cost_total`, `llm_tokens_total`, labels
 * `agent_name` and `source` are confirmed; a `team` label and a token-type
 * label are NOT confirmed). Everything that might differ per-deployment is
 * configurable via env so this can be adapted without code changes:
 *
 *   PROMETHEUS_URL              base URL of the Prometheus server (required)
 *   TOKENOMICS_AGENT_LABEL      default "agent_name"
 *   TOKENOMICS_MODEL_LABEL      default "model"
 *   TOKENOMICS_SOURCE_LABEL     default "source"
 *   TOKENOMICS_TEAM_LABEL       default "team"  (falls back to source value)
 *   TOKENOMICS_TOKENTYPE_LABEL  default "type"  (values input/prompt vs output/completion)
 *   TOKENOMICS_COST_METRIC      default "llm_cost_total"
 *   TOKENOMICS_TOKENS_METRIC    default "llm_tokens_total"
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Important semantic note: Prometheus stores aggregated counters, not
 * individual requests. This source therefore emits ONE synthetic UsageRecord
 * per (day-bucket, agent, model) representing that bucket's totals. Aggregating
 * tools (summary, by-team, by-agent, model-mix, anomalies) are exact;
 * get_top_expensive_requests becomes "most expensive bucket" rather than
 * per-request, and prompt_preview is empty (Prometheus holds no prompt text).
 */

const DAY_SECONDS = 86400;

interface PromMatrixResult {
  metric: Record<string, string>;
  values: [number, string][]; // [unixSeconds, valueString]
}

interface PromResponse {
  status: string;
  data?: { resultType: string; result: PromMatrixResult[] };
  error?: string;
  errorType?: string;
}

export class PrometheusDataSource implements DataSource {
  readonly name = "prometheus";

  private readonly agentLabel = process.env.TOKENOMICS_AGENT_LABEL ?? "agent_name";
  private readonly modelLabel = process.env.TOKENOMICS_MODEL_LABEL ?? "model";
  private readonly sourceLabel = process.env.TOKENOMICS_SOURCE_LABEL ?? "source";
  private readonly teamLabel = process.env.TOKENOMICS_TEAM_LABEL ?? "team";
  private readonly tokenTypeLabel = process.env.TOKENOMICS_TOKENTYPE_LABEL ?? "type";
  private readonly costMetric = process.env.TOKENOMICS_COST_METRIC ?? "llm_cost_total";
  private readonly tokensMetric = process.env.TOKENOMICS_TOKENS_METRIC ?? "llm_tokens_total";

  constructor(private readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async getUsageRecords(startDate?: string, endDate?: string): Promise<UsageRecord[]> {
    // Default to a trailing 14-day window when unspecified.
    const end = endDate ? Date.parse(`${endDate}T23:59:59Z`) : Date.now();
    const start = startDate
      ? Date.parse(`${startDate}T00:00:00Z`)
      : end - 14 * DAY_SECONDS * 1000;

    const startS = Math.floor(start / 1000);
    const endS = Math.floor(end / 1000);

    const groupBy = `${this.agentLabel}, ${this.modelLabel}, ${this.sourceLabel}, ${this.teamLabel}`;
    const costQuery = `sum by (${groupBy}) (increase(${this.costMetric}[1d]))`;
    const tokQuery = `sum by (${groupBy}, ${this.tokenTypeLabel}) (increase(${this.tokensMetric}[1d]))`;

    const [costRes, tokRes] = await Promise.all([
      this.queryRange(costQuery, startS, endS, DAY_SECONDS),
      this.queryRange(tokQuery, startS, endS, DAY_SECONDS),
    ]);

    // key = day|agent|model  ->  accumulating record
    const acc = new Map<string, UsageRecord>();

    const keyFor = (m: Record<string, string>, dayIso: string) =>
      `${dayIso}|${m[this.agentLabel] ?? "unknown"}|${m[this.modelLabel] ?? "unknown"}`;

    const ensure = (m: Record<string, string>, unixSec: number): UsageRecord => {
      const iso = new Date(unixSec * 1000).toISOString();
      const dayIso = iso.slice(0, 10);
      const key = keyFor(m, dayIso);
      let rec = acc.get(key);
      if (!rec) {
        rec = {
          timestamp: `${dayIso}T12:00:00.000Z`, // bucket midpoint
          team: m[this.teamLabel] || m[this.sourceLabel] || "unknown",
          agent_name: m[this.agentLabel] ?? "unknown",
          model: m[this.modelLabel] ?? "unknown",
          cost_usd: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          prompt_preview: "", // Prometheus holds no prompt text
        };
        acc.set(key, rec);
      }
      return rec;
    };

    for (const series of costRes) {
      for (const [ts, val] of series.values) {
        const v = Number(val);
        if (!Number.isFinite(v) || v === 0) continue;
        ensure(series.metric, ts).cost_usd += v;
      }
    }

    for (const series of tokRes) {
      const type = (series.metric[this.tokenTypeLabel] ?? "").toLowerCase();
      const isCompletion = type === "output" || type === "completion";
      for (const [ts, val] of series.values) {
        const v = Number(val);
        if (!Number.isFinite(v) || v === 0) continue;
        const rec = ensure(series.metric, ts);
        if (isCompletion) rec.completion_tokens += Math.round(v);
        else rec.prompt_tokens += Math.round(v);
      }
    }

    // Round cost to 6 dp to match the synthetic source's precision.
    return [...acc.values()]
      .map((r) => ({ ...r, cost_usd: Math.round(r.cost_usd * 1e6) / 1e6 }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private async queryRange(
    query: string,
    start: number,
    end: number,
    step: number,
  ): Promise<PromMatrixResult[]> {
    const url = new URL(`${this.baseUrl}/api/v1/query_range`);
    url.searchParams.set("query", query);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    url.searchParams.set("step", String(step));

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(
        `Prometheus query failed (${res.status} ${res.statusText}) for query: ${query}`,
      );
    }
    const body = (await res.json()) as PromResponse;
    if (body.status !== "success" || !body.data) {
      throw new Error(
        `Prometheus returned error for query "${query}": ${body.errorType ?? ""} ${body.error ?? ""}`.trim(),
      );
    }
    if (body.data.resultType !== "matrix") {
      throw new Error(
        `Expected matrix result from query_range, got ${body.data.resultType}`,
      );
    }
    return body.data.result;
  }
}
