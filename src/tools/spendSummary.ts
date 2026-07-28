import type { DataSource } from "../datasource.js";
import type { GroupBy, SpendSummaryRow } from "../types.js";
import { round2, weekStart } from "../util.js";

/**
 * Total cost + token usage bucketed by day or week over [start_date, end_date].
 * Rows are returned in chronological order.
 */
export async function getSpendSummary(
  ds: DataSource,
  startDate: string,
  endDate: string,
  groupBy: GroupBy = "day",
): Promise<SpendSummaryRow[]> {
  const records = await ds.getUsageRecords(startDate, endDate);
  const buckets = new Map<string, SpendSummaryRow>();

  for (const r of records) {
    const day = r.timestamp.slice(0, 10);
    const key = groupBy === "week" ? weekStart(day) : day;
    let row = buckets.get(key);
    if (!row) {
      row = {
        date: key,
        total_cost_usd: 0,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
      };
      buckets.set(key, row);
    }
    row.total_cost_usd += r.cost_usd;
    row.prompt_tokens += r.prompt_tokens;
    row.completion_tokens += r.completion_tokens;
    row.total_tokens += r.prompt_tokens + r.completion_tokens;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ ...row, total_cost_usd: round2(row.total_cost_usd) }));
}
