import type { DataSource } from "../datasource.js";
import type { ModelMixRow } from "../types.js";
import { round1, round2 } from "../util.js";

/**
 * Request count, cost and percentage-of-total-spend broken down by model,
 * sorted by cost descending. pct_of_total is the model's share of total USD.
 */
export async function getModelMix(
  ds: DataSource,
  startDate: string,
  endDate: string,
): Promise<ModelMixRow[]> {
  const records = await ds.getUsageRecords(startDate, endDate);
  const buckets = new Map<string, { request_count: number; total_cost_usd: number }>();
  let grandTotal = 0;

  for (const r of records) {
    let row = buckets.get(r.model);
    if (!row) {
      row = { request_count: 0, total_cost_usd: 0 };
      buckets.set(r.model, row);
    }
    row.request_count += 1;
    row.total_cost_usd += r.cost_usd;
    grandTotal += r.cost_usd;
  }

  return [...buckets.entries()]
    .map(([model, row]) => ({
      model,
      request_count: row.request_count,
      total_cost_usd: round2(row.total_cost_usd),
      pct_of_total: grandTotal > 0 ? round1((row.total_cost_usd / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);
}
