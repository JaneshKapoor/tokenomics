/**
 * Invented per-model pricing (USD per 1,000,000 tokens), deliberately spread
 * across a cheap / mid / expensive tier so get_model_mix and the cost-optimizer
 * tool have a meaningful spread to work with.
 *
 * These are fictional rates for a demo dataset — not real published prices.
 */
export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  /** Relative tier, used by the cost optimizer to pick the cheapest target. */
  tier: "cheap" | "mid" | "expensive";
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5": { input_per_mtok: 1, output_per_mtok: 5, tier: "cheap" },
  "claude-sonnet-5": { input_per_mtok: 3, output_per_mtok: 15, tier: "mid" },
  "claude-opus-4-8": { input_per_mtok: 15, output_per_mtok: 75, tier: "expensive" },
};

/** The cheapest model id, used as the re-pricing target by the optimizer. */
export const CHEAPEST_MODEL = "claude-haiku-4-5";

/** Cost in USD for a request given its model and token counts. */
export function costFor(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING[CHEAPEST_MODEL];
  const cost =
    (promptTokens / 1_000_000) * p.input_per_mtok +
    (completionTokens / 1_000_000) * p.output_per_mtok;
  // Round to 6 decimals to keep per-request numbers clean.
  return Math.round(cost * 1e6) / 1e6;
}
