import type { DataSource } from "../datasource.js";
import type { SpendByMemberRow } from "../types.js";
import { round2 } from "../util.js";

/**
 * Total cost, tokens and request count grouped by team member, sorted by cost
 * descending — i.e. "who is spending the most on AI". Team is taken from the
 * member's records. Dates are optional; when omitted the full available window
 * is used.
 */
export async function getSpendByMember(
  ds: DataSource,
  startDate?: string,
  endDate?: string,
): Promise<SpendByMemberRow[]> {
  const records = await ds.getUsageRecords(startDate, endDate);
  const buckets = new Map<string, SpendByMemberRow>();

  for (const r of records) {
    let row = buckets.get(r.member);
    if (!row) {
      row = {
        member: r.member,
        team: r.team,
        total_cost_usd: 0,
        total_tokens: 0,
        request_count: 0,
      };
      buckets.set(r.member, row);
    }
    row.total_cost_usd += r.cost_usd;
    row.total_tokens += r.prompt_tokens + r.completion_tokens;
    row.request_count += 1;
  }

  return [...buckets.values()]
    .map((row) => ({ ...row, total_cost_usd: round2(row.total_cost_usd) }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);
}
