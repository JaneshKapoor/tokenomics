#!/usr/bin/env node
/**
 * MCP stdio smoke test.
 *
 * Spawns an MCP server command, performs the initialize handshake, lists tools,
 * and calls one tool — asserting a well-formed response. Works against either
 * the local node build or a Docker container.
 *
 *   node scripts/mcp-smoke.mjs                          # -> node dist/index.js
 *   node scripts/mcp-smoke.mjs docker run -i --rm tokenomics-mcp
 *
 * Exits 0 on success, 1 on failure.
 */
import { spawn } from "node:child_process";

const EXPECTED_TOOLS = [
  "get_spend_summary",
  "get_spend_by_team",
  "get_spend_by_agent",
  "get_top_expensive_requests",
  "get_model_mix",
  "get_spend_anomalies",
  "get_cost_optimizer_savings_estimate",
];

const cmd = process.argv.slice(2);
const [bin, ...args] = cmd.length ? cmd : ["node", "dist/index.js"];

const child = spawn(bin, args, { stdio: ["pipe", "pipe", "inherit"] });

const pending = new Map();
let buf = "";
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}
function request(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => reject(new Error(`timeout waiting for id=${id}`)), 10000);
  });
}

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  child.kill();
  process.exit(1);
}

try {
  await request(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-smoke", version: "0" },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const list = await request(2, "tools/list", {});
  const names = (list.result?.tools ?? []).map((t) => t.name).sort();
  const missing = EXPECTED_TOOLS.filter((n) => !names.includes(n));
  if (missing.length) fail(`missing tools: ${missing.join(", ")}`);
  if (names.length !== EXPECTED_TOOLS.length)
    fail(`expected ${EXPECTED_TOOLS.length} tools, got ${names.length}: ${names.join(", ")}`);
  console.log(`✓ tools/list returned all ${names.length} tools`);

  const call = await request(3, "tools/call", {
    name: "get_spend_anomalies",
    arguments: { threshold_multiplier: 2.0 },
  });
  const text = call.result?.content?.[0]?.text;
  if (!text) fail("tools/call returned no text content");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) fail("get_spend_anomalies did not return a JSON array");
  console.log(`✓ tools/call get_spend_anomalies returned ${parsed.length} anomaly row(s)`);

  console.log("SMOKE PASS");
  child.kill();
  process.exit(0);
} catch (err) {
  fail(err.message);
}
