/**
 * Shared domain types for Tokenomics.
 *
 * A single normalized "usage record" is the atom every DataSource produces and
 * every tool aggregates over. Keeping one flat shape means the Synthetic and
 * Prometheus sources only have to agree on this, and all tool logic is source
 * agnostic.
 */

/** One AI request's worth of cost + token usage. */
export interface UsageRecord {
  /** ISO-8601 timestamp of the request. */
  timestamp: string;
  /** Owning team (e.g. "Team Nebula"). */
  team: string;
  /** Agent / project that made the call (e.g. "sales-copilot"). */
  agent_name: string;
  /** Team member the call is attributed to (e.g. "Ava Chen"). */
  member: string;
  /** Model id (e.g. "claude-haiku-4-5"). */
  model: string;
  /** Total USD cost of this request. */
  cost_usd: number;
  prompt_tokens: number;
  completion_tokens: number;
  /** First ~100 chars of the prompt. Never the full prompt. */
  prompt_preview: string;
}

/** get_spend_summary row. */
export interface SpendSummaryRow {
  date: string;
  total_cost_usd: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

/** get_spend_by_team row. */
export interface SpendByTeamRow {
  team: string;
  total_cost_usd: number;
  total_tokens: number;
}

/** get_spend_by_agent row. */
export interface SpendByAgentRow {
  agent_name: string;
  total_cost_usd: number;
  total_tokens: number;
  request_count: number;
}

/** get_spend_by_member row. */
export interface SpendByMemberRow {
  member: string;
  team: string;
  total_cost_usd: number;
  total_tokens: number;
  request_count: number;
}

/** get_top_expensive_requests row. */
export interface TopExpensiveRequestRow {
  timestamp: string;
  agent_name: string;
  model: string;
  cost_usd: number;
  prompt_preview: string;
  prompt_tokens: number;
  completion_tokens: number;
}

/** get_model_mix row. */
export interface ModelMixRow {
  model: string;
  request_count: number;
  total_cost_usd: number;
  pct_of_total: number;
}

/** get_spend_anomalies row. */
export interface SpendAnomalyRow {
  agent_name: string;
  date: string;
  spend_usd: number;
  seven_day_avg_usd: number;
  ratio: number;
}

/** get_cost_optimizer_savings_estimate result. */
export interface CostOptimizerEstimate {
  current_cost_usd: number;
  estimated_savings_usd: number;
  pct_savings: number;
  /** Human-readable note describing the assumption behind the estimate. */
  assumption: string;
}

export type GroupBy = "day" | "week";
