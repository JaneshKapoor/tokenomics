#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Tokenomics MCP server — entrypoint.
 *
 * MILESTONE 1 (scaffold): all 7 tools are registered over stdio and return
 * dummy JSON so `list_tools` / `call_tool` round-trip correctly. Real logic
 * backed by the DataSource layer is wired in a later milestone.
 */

const server = new McpServer({
  name: "tokenomics",
  version: "0.1.0",
});

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

server.registerTool(
  "get_spend_summary",
  {
    title: "Spend summary over time",
    description:
      "Total AI cost and token usage bucketed by day or week over a date range.",
    inputSchema: {
      start_date: z.string().describe("Start date, YYYY-MM-DD (inclusive)."),
      end_date: z.string().describe("End date, YYYY-MM-DD (inclusive)."),
      group_by: z.enum(["day", "week"]).default("day"),
    },
  },
  async () =>
    json([
      {
        date: "2026-07-01",
        total_cost_usd: 12.34,
        total_tokens: 100000,
        prompt_tokens: 60000,
        completion_tokens: 40000,
      },
    ]),
);

server.registerTool(
  "get_spend_by_team",
  {
    title: "Spend by team",
    description: "Total cost and tokens grouped by team over a date range.",
    inputSchema: {
      start_date: z.string().describe("Start date, YYYY-MM-DD (inclusive)."),
      end_date: z.string().describe("End date, YYYY-MM-DD (inclusive)."),
    },
  },
  async () => json([{ team: "Team Nebula", total_cost_usd: 42.0, total_tokens: 500000 }]),
);

server.registerTool(
  "get_spend_by_agent",
  {
    title: "Spend by agent",
    description:
      "Total cost, tokens and request count grouped by agent/project over a date range.",
    inputSchema: {
      start_date: z.string().describe("Start date, YYYY-MM-DD (inclusive)."),
      end_date: z.string().describe("End date, YYYY-MM-DD (inclusive)."),
    },
  },
  async () =>
    json([
      {
        agent_name: "sales-copilot",
        total_cost_usd: 18.5,
        total_tokens: 220000,
        request_count: 140,
      },
    ]),
);

server.registerTool(
  "get_top_expensive_requests",
  {
    title: "Top expensive requests",
    description:
      "The most expensive individual requests in a date range, with a short prompt preview (never the full prompt).",
    inputSchema: {
      start_date: z.string().describe("Start date, YYYY-MM-DD (inclusive)."),
      end_date: z.string().describe("End date, YYYY-MM-DD (inclusive)."),
      limit: z.number().int().positive().default(10),
    },
  },
  async () =>
    json([
      {
        timestamp: "2026-07-05T14:03:00.000Z",
        agent_name: "deck-generator",
        model: "claude-opus-4-8",
        cost_usd: 1.92,
        prompt_preview: "Generate a 20-slide investor deck for...",
        prompt_tokens: 8200,
        completion_tokens: 4100,
      },
    ]),
);

server.registerTool(
  "get_model_mix",
  {
    title: "Model mix",
    description:
      "Request count, cost and percentage-of-total spend broken down by model.",
    inputSchema: {
      start_date: z.string().describe("Start date, YYYY-MM-DD (inclusive)."),
      end_date: z.string().describe("End date, YYYY-MM-DD (inclusive)."),
    },
  },
  async () =>
    json([
      {
        model: "claude-haiku-4-5",
        request_count: 800,
        total_cost_usd: 12.0,
        pct_of_total: 22.5,
      },
    ]),
);

server.registerTool(
  "get_spend_anomalies",
  {
    title: "Spend anomalies",
    description:
      "Agent/day combinations whose spend exceeds their trailing 7-day average by a threshold multiplier.",
    inputSchema: {
      threshold_multiplier: z
        .number()
        .positive()
        .default(2.0)
        .describe("Flag when daily spend >= this * the 7-day average."),
    },
  },
  async () =>
    json([
      {
        agent_name: "clustering-monitor",
        date: "2026-07-09",
        spend_usd: 48.0,
        seven_day_avg_usd: 9.6,
        ratio: 5.0,
      },
    ]),
);

server.registerTool(
  "get_cost_optimizer_savings_estimate",
  {
    title: "Cost optimizer savings estimate",
    description:
      "Estimates savings if a share of small/simple requests were routed to a cheaper model.",
    inputSchema: {
      cheap_model_threshold_tokens: z
        .number()
        .int()
        .positive()
        .default(1000)
        .describe(
          "Requests with prompt_tokens below this are considered 'simple' and candidates for a cheaper model.",
        ),
    },
  },
  async () =>
    json({
      current_cost_usd: 220.0,
      estimated_savings_usd: 46.2,
      pct_savings: 21.0,
      assumption:
        "Simple requests (< threshold prompt tokens) re-priced at the cheapest model's rate.",
    }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport keeps the process alive; do not log to stdout (it corrupts
  // the JSON-RPC stream). Diagnostics go to stderr.
  console.error("[tokenomics] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[tokenomics] fatal:", err);
  process.exit(1);
});
