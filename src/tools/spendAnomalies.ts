import type { DataSource } from "../datasource.js";
import type { SpendAnomalyRow } from "../types.js";
import { round2 } from "../util.js";

/**
 * Flags (agent, day) pairs whose spend is at least `thresholdMultiplier` times
 * that agent's trailing 7-day average spend.
 *
 * Operates over the source's full available window. A day needs at least 3
 * prior days of history (with a positive average) to be eligible, so the very
 * start of the window doesn't produce noise. Sorted by ratio descending.
 */
export async function getSpendAnomalies(
  ds: DataSource,
  thresholdMultiplier = 2.0,
): Promise<SpendAnomalyRow[]> {
  const records = await ds.getUsageRecords();

  // agent -> (date -> spend)
  const byAgent = new Map<string, Map<string, number>>();
  for (const r of records) {
    const day = r.timestamp.slice(0, 10);
    let days = byAgent.get(r.agent_name);
    if (!days) {
      days = new Map();
      byAgent.set(r.agent_name, days);
    }
    days.set(day, (days.get(day) ?? 0) + r.cost_usd);
  }

  const anomalies: SpendAnomalyRow[] = [];
  const MIN_PRIOR_DAYS = 3;
  const WINDOW = 7;

  for (const [agent, days] of byAgent) {
    const sorted = [...days.keys()].sort();
    for (let i = 0; i < sorted.length; i++) {
      const priorDates = sorted.slice(Math.max(0, i - WINDOW), i);
      if (priorDates.length < MIN_PRIOR_DAYS) continue;

      const avg =
        priorDates.reduce((s, d) => s + (days.get(d) ?? 0), 0) / priorDates.length;
      if (avg <= 0) continue;

      const spend = days.get(sorted[i]) ?? 0;
      const ratio = spend / avg;
      if (ratio >= thresholdMultiplier) {
        anomalies.push({
          agent_name: agent,
          date: sorted[i],
          spend_usd: round2(spend),
          seven_day_avg_usd: round2(avg),
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.ratio - a.ratio);
}
