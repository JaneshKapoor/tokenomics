#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createDataSource } from "./factory.js";
import { getSpendSummary } from "./tools/spendSummary.js";
import { getSpendByTeam } from "./tools/spendByTeam.js";
import { getSpendByAgent } from "./tools/spendByAgent.js";
import { getTopExpensiveRequests } from "./tools/topExpensiveRequests.js";
import { getModelMix } from "./tools/modelMix.js";
import { getSpendAnomalies } from "./tools/spendAnomalies.js";
import { getCostOptimizerSavingsEstimate } from "./tools/costOptimizer.js";
import { getSpendByMember } from "./tools/spendByMember.js";

/**
 * Tokenomics MCP server — entrypoint.
 *
 * Registers 8 tools over stdio, each a thin wrapper over the active DataSource
 * (synthetic by default, prometheus via env). Responses are compact JSON meant
 * to be consumed by an LLM building a dashboard, not rendered directly.
 */

const ds = createDataSource();

const server = new McpServer({
  name: "tokenomics",
  version: "0.2.0",
});

/** Wrap any JSON-serializable result as an MCP text content response. */
const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// Date params are optional everywhere: when omitted, tools use the full
// available window (~last 14 days). Telling the model to omit dates it isn't
// sure of avoids empty results from guessing a window outside the data.
const startDateSchema = z
  .string()
  .optional()
  .describe(
    "Start date YYYY-MM-DD (inclusive). OPTIONAL — omit to use the full available window (~last 14 days). Do not guess a date if unsure.",
  );
const endDateSchema = z
  .string()
  .optional()
  .describe(
    "End date YYYY-MM-DD (inclusive). OPTIONAL — omit to use the full available window (~last 14 days). Do not guess a date if unsure.",
  );

server.registerTool(
  "get_spend_summary",
  {
    title: "Spend summary over time",
    description:
      "Total AI cost and token usage bucketed by day or week over a date range. " +
      "Dates optional (omit for the full ~14-day window). " +
      "Returns [{ date, total_cost_usd, total_tokens, prompt_tokens, completion_tokens }].",
    inputSchema: {
      start_date: startDateSchema,
      end_date: endDateSchema,
      group_by: z.enum(["day", "week"]).default("day"),
    },
  },
  async ({ start_date, end_date, group_by }) =>
    json(await getSpendSummary(ds, start_date, end_date, group_by)),
);

server.registerTool(
  "get_spend_by_team",
  {
    title: "Spend by team",
    description:
      "Total cost and tokens grouped by team over a date range, sorted by cost. " +
      "Dates optional (omit for the full ~14-day window). " +
      "Returns [{ team, total_cost_usd, total_tokens }].",
    inputSchema: {
      start_date: startDateSchema,
      end_date: endDateSchema,
    },
  },
  async ({ start_date, end_date }) => json(await getSpendByTeam(ds, start_date, end_date)),
);

server.registerTool(
  "get_spend_by_agent",
  {
    title: "Spend by agent",
    description:
      "Total cost, tokens and request count grouped by agent/project over a date range, " +
      "sorted by cost. Dates optional (omit for the full ~14-day window). " +
      "Returns [{ agent_name, total_cost_usd, total_tokens, request_count }].",
    inputSchema: {
      start_date: startDateSchema,
      end_date: endDateSchema,
    },
  },
  async ({ start_date, end_date }) => json(await getSpendByAgent(ds, start_date, end_date)),
);

server.registerTool(
  "get_top_expensive_requests",
  {
    title: "Top expensive requests",
    description:
      "The most expensive individual requests in a date range, with a short prompt preview " +
      "(first ~100 chars, never the full prompt). Dates optional (omit for the full ~14-day " +
      "window). Returns [{ timestamp, agent_name, model, " +
      "cost_usd, prompt_preview, prompt_tokens, completion_tokens }].",
    inputSchema: {
      start_date: startDateSchema,
      end_date: endDateSchema,
      limit: z.number().int().positive().default(10),
    },
  },
  async ({ start_date, end_date, limit }) =>
    json(await getTopExpensiveRequests(ds, start_date, end_date, limit)),
);

server.registerTool(
  "get_model_mix",
  {
    title: "Model mix",
    description:
      "Request count, cost and percentage-of-total spend broken down by model, sorted by cost. " +
      "Dates optional (omit for the full ~14-day window). " +
      "Returns [{ model, request_count, total_cost_usd, pct_of_total }].",
    inputSchema: {
      start_date: startDateSchema,
      end_date: endDateSchema,
    },
  },
  async ({ start_date, end_date }) => json(await getModelMix(ds, start_date, end_date)),
);

server.registerTool(
  "get_spend_by_member",
  {
    title: "Spend by team member",
    description:
      "Total cost, tokens and request count grouped by team member — i.e. WHO is spending the " +
      "most on AI — sorted by cost descending. Dates optional (omit for the full ~14-day window). " +
      "Returns [{ member, team, total_cost_usd, total_tokens, request_count }].",
    inputSchema: {
      start_date: startDateSchema,
      end_date: endDateSchema,
    },
  },
  async ({ start_date, end_date }) => json(await getSpendByMember(ds, start_date, end_date)),
);

server.registerTool(
  "get_spend_anomalies",
  {
    title: "Spend anomalies",
    description:
      "Agent/day combinations whose spend exceeds their trailing 7-day average by a threshold " +
      "multiplier. Operates over the full available window. Returns [{ agent_name, date, " +
      "spend_usd, seven_day_avg_usd, ratio }].",
    inputSchema: {
      threshold_multiplier: z
        .number()
        .positive()
        .default(2.0)
        .describe("Flag when daily spend >= this * the 7-day average."),
    },
  },
  async ({ threshold_multiplier }) =>
    json(await getSpendAnomalies(ds, threshold_multiplier)),
);

server.registerTool(
  "get_cost_optimizer_savings_estimate",
  {
    title: "Cost optimizer savings estimate",
    description:
      "Estimates savings if 'simple' requests (prompt_tokens below a threshold) were routed to " +
      "the cheapest model. Operates over the full window. Returns { current_cost_usd, " +
      "estimated_savings_usd, pct_savings, assumption }.",
    inputSchema: {
      cheap_model_threshold_tokens: z
        .number()
        .int()
        .positive()
        .default(1000)
        .describe(
          "Requests with prompt_tokens below this are considered 'simple' candidates for a cheaper model.",
        ),
    },
  },
  async ({ cheap_model_threshold_tokens }) =>
    json(await getCostOptimizerSavingsEstimate(ds, cheap_model_threshold_tokens)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never write to stdout — it carries the JSON-RPC stream. Diagnostics -> stderr.
  console.error(`[tokenomics] MCP server running on stdio (source: ${ds.name})`);
}

main().catch((err) => {
  console.error("[tokenomics] fatal:", err);
  process.exit(1);
});
