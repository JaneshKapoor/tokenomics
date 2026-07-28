import type { DataSource } from "./datasource.js";
import { SyntheticDataSource } from "./synthetic.js";
import { PrometheusDataSource } from "./prometheus.js";

/**
 * Selects the DataSource based on env:
 *   TOKENOMICS_DATA_SOURCE = "synthetic" (default) | "prometheus"
 *   PROMETHEUS_URL         = base URL, required when source is "prometheus"
 */
export function createDataSource(): DataSource {
  const kind = (process.env.TOKENOMICS_DATA_SOURCE ?? "synthetic").toLowerCase();

  if (kind === "prometheus") {
    const url = process.env.PROMETHEUS_URL;
    if (!url) {
      throw new Error(
        "TOKENOMICS_DATA_SOURCE=prometheus requires PROMETHEUS_URL to be set.",
      );
    }
    return new PrometheusDataSource(url);
  }

  if (kind !== "synthetic") {
    console.error(
      `[tokenomics] unknown TOKENOMICS_DATA_SOURCE="${kind}", falling back to synthetic`,
    );
  }
  return new SyntheticDataSource();
}
