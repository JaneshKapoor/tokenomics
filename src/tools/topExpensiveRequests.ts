import type { DataSource } from "../datasource.js";
import type { TopExpensiveRequestRow } from "../types.js";
import { round2 } from "../util.js";

/**
 * The `limit` most expensive individual requests in the window, sorted by cost
 * descending. Only a short prompt preview is returned — never the full prompt.
 */
export async function getTopExpensiveRequests(
  ds: DataSource,
  startDate?: string,
  endDate?: string,
  limit = 10,
): Promise<TopExpensiveRequestRow[]> {
  const records = await ds.getUsageRecords(startDate, endDate);
  return [...records]
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, limit)
    .map((r) => ({
      timestamp: r.timestamp,
      agent_name: r.agent_name,
      model: r.model,
      cost_usd: round2(r.cost_usd),
      prompt_preview: r.prompt_preview.slice(0, 100),
      prompt_tokens: r.prompt_tokens,
      completion_tokens: r.completion_tokens,
    }));
}
