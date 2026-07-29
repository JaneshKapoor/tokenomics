/**
 * Standalone test harness — exercises every tool against the active DataSource
 * and prints results. Run with `npm run test:tools`. Not part of the MCP
 * surface; purely a developer smoke test.
 */
import { createDataSource } from "./factory.js";
import { getSpendSummary } from "./tools/spendSummary.js";
import { getSpendByTeam } from "./tools/spendByTeam.js";
import { getSpendByAgent } from "./tools/spendByAgent.js";
import { getSpendByMember } from "./tools/spendByMember.js";
import { getTopExpensiveRequests } from "./tools/topExpensiveRequests.js";
import { getModelMix } from "./tools/modelMix.js";
import { getSpendAnomalies } from "./tools/spendAnomalies.js";
import { getCostOptimizerSavingsEstimate } from "./tools/costOptimizer.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const ds = createDataSource();
  const start = daysAgo(13);
  const end = today();

  const show = (label: string, data: unknown) => {
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(data, null, 2));
  };

  show("get_spend_summary (week)", await getSpendSummary(ds, start, end, "week"));
  show("get_spend_by_team", await getSpendByTeam(ds, start, end));
  show("get_spend_by_agent", await getSpendByAgent(ds, start, end));
  show("get_spend_by_member", await getSpendByMember(ds, start, end));
  show("get_spend_by_member (no dates -> full window)", await getSpendByMember(ds));
  show("get_top_expensive_requests (limit 5)", await getTopExpensiveRequests(ds, start, end, 5));
  show("get_model_mix", await getModelMix(ds, start, end));
  show("get_spend_anomalies (2.0x)", await getSpendAnomalies(ds, 2.0));
  show("get_cost_optimizer_savings_estimate", await getCostOptimizerSavingsEstimate(ds));

  console.log("\nAll 7 tools executed successfully.");
}

main().catch((err) => {
  console.error("test-harness failed:", err);
  process.exit(1);
});
