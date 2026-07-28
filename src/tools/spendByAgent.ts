import type { DataSource } from "../datasource.js";
import type { SpendByAgentRow } from "../types.js";
import { round2 } from "../util.js";

/**
 * Total cost, tokens and request count grouped by agent/project,
 * sorted by cost descending.
 */
export async function getSpendByAgent(
  ds: DataSource,
  startDate: string,
  endDate: string,
): Promise<SpendByAgentRow[]> {
  const records = await ds.getUsageRecords(startDate, endDate);
  const buckets = new Map<string, SpendByAgentRow>();

  for (const r of records) {
    let row = buckets.get(r.agent_name);
    if (!row) {
      row = {
        agent_name: r.agent_name,
        total_cost_usd: 0,
        total_tokens: 0,
        request_count: 0,
      };
      buckets.set(r.agent_name, row);
    }
    row.total_cost_usd += r.cost_usd;
    row.total_tokens += r.prompt_tokens + r.completion_tokens;
    row.request_count += 1;
  }

  return [...buckets.values()]
    .map((row) => ({ ...row, total_cost_usd: round2(row.total_cost_usd) }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);
}
