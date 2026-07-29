import type { DataSource } from "../datasource.js";
import type { SpendByTeamRow } from "../types.js";
import { round2 } from "../util.js";

/** Total cost + tokens grouped by team, sorted by cost descending. */
export async function getSpendByTeam(
  ds: DataSource,
  startDate?: string,
  endDate?: string,
): Promise<SpendByTeamRow[]> {
  const records = await ds.getUsageRecords(startDate, endDate);
  const buckets = new Map<string, SpendByTeamRow>();

  for (const r of records) {
    let row = buckets.get(r.team);
    if (!row) {
      row = { team: r.team, total_cost_usd: 0, total_tokens: 0 };
      buckets.set(r.team, row);
    }
    row.total_cost_usd += r.cost_usd;
    row.total_tokens += r.prompt_tokens + r.completion_tokens;
  }

  return [...buckets.values()]
    .map((row) => ({ ...row, total_cost_usd: round2(row.total_cost_usd) }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);
}
