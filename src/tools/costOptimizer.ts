import type { DataSource } from "../datasource.js";
import type { CostOptimizerEstimate } from "../types.js";
import { CHEAPEST_MODEL, costFor } from "../pricing.js";
import { round1, round2 } from "../util.js";

/**
 * Estimates savings from routing "simple" requests to the cheapest model.
 *
 * A request is considered simple when its prompt_tokens is below
 * `cheapModelThresholdTokens`. For each such request that isn't already on the
 * cheapest model, we re-price it at the cheapest model's rate and count the
 * difference as savings. This is a rough what-if, not a recommendation to
 * change any specific call.
 */
export async function getCostOptimizerSavingsEstimate(
  ds: DataSource,
  cheapModelThresholdTokens = 1000,
): Promise<CostOptimizerEstimate> {
  const records = await ds.getUsageRecords();

  let currentCost = 0;
  let optimizedCost = 0;

  for (const r of records) {
    currentCost += r.cost_usd;

    const isSimple = r.prompt_tokens < cheapModelThresholdTokens;
    if (isSimple && r.model !== CHEAPEST_MODEL) {
      optimizedCost += costFor(CHEAPEST_MODEL, r.prompt_tokens, r.completion_tokens);
    } else {
      optimizedCost += r.cost_usd;
    }
  }

  const savings = currentCost - optimizedCost;
  return {
    current_cost_usd: round2(currentCost),
    estimated_savings_usd: round2(savings),
    pct_savings: currentCost > 0 ? round1((savings / currentCost) * 100) : 0,
    assumption: `Requests with prompt_tokens < ${cheapModelThresholdTokens} re-priced at ${CHEAPEST_MODEL} rates.`,
  };
}
