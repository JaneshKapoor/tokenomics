import type { DataSource } from "./datasource.js";
import type { UsageRecord } from "./types.js";

/**
 * PrometheusDataSource — reads Archestra's observability metrics.
 *
 * PLACEHOLDER (milestone 5): the real PromQL implementation is added once a
 * live Prometheus endpoint is verified. Until then this compiles and fails
 * loudly if selected, so the synthetic default path is never affected.
 */
export class PrometheusDataSource implements DataSource {
  readonly name = "prometheus";
  constructor(private readonly baseUrl: string) {}

  async getUsageRecords(_startDate?: string, _endDate?: string): Promise<UsageRecord[]> {
    throw new Error(
      `PrometheusDataSource is not yet implemented (target: ${this.baseUrl}). ` +
        "Set TOKENOMICS_DATA_SOURCE=synthetic to use the default source.",
    );
  }
}
