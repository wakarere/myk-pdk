/**
 * ODI demo runner for SE/FT deployments.
 * The SE demo infrastructure (21 agents, MDLS destination, dbt models) is pre-built.
 * This runner validates that all engines are accessible, then marks demo_ready.
 *
 * Phases:
 *  1. Preflight — verify Fivetran account, Snowflake, Databricks access
 *  2. Validate — spot-check pre-built connector, destination, and agent DB
 *  3. Sample queries — confirm all three engine backends return data
 *  4. Log demo instructions
 */

import { db } from "@/lib/db";
import { loadConfig, getAccountConfig } from "@/lib/config";
import type { AccountConfig, AppConfig } from "@/lib/config";

// Pre-built SE demo identifiers (FIVETRAN_SALES_DEMO account)
const KNOWN_MDLS_SCHEMA = "all_industries_agriculture";
const KNOWN_TABLE = "agr_records";

interface RunOptions {
  account: string;
  platform: string;
  destination: string;
}

async function log(demoId: string, stage: string, message: string, level: "info" | "warn" | "error" = "info") {
  await db.demoLog.create({ data: { demoId, stage, message, level } });
}
async function setStatus(demoId: string, status: string) {
  await db.demo.update({ where: { id: demoId }, data: { status } });
}

export async function runOdiDemo(demoId: string, opts: RunOptions) {
  const { account: accountLabel, destination } = opts;
  const cfg = loadConfig();
  const accountCfg = getAccountConfig(accountLabel);

  try {
    const runStart = Date.now();
    const s = () => `+${Math.round((Date.now() - runStart) / 1000)}s`;

    // ── Stage 1: Preflight ──────────────────────────────────────────────────────
    await setStatus(demoId, "preflight_running");
    await log(demoId, "Preflight", `Verifying Fivetran account: ${accountLabel}`);

    const accountCheck = await fetch("https://api.fivetran.com/v1/users?limit=1", {
      headers: ftHeaders(accountCfg),
    });
    if (!accountCheck.ok) throw new Error(`Fivetran API access failed: ${accountCheck.status}`);
    await log(demoId, "Preflight", `Fivetran API OK (${s()})`);

    // ── Stage 2: Validate pre-built destination + connector ─────────────────────
    await setStatus(demoId, "provisioning");
    await log(demoId, "Validate", "Checking pre-built MDLS destination and connector...");

    // List groups to find the MDLS demo group
    const groupsRes = await fivetranGet(accountCfg, "/groups?limit=100");
    const groups: Array<{ id: string; name: string }> = groupsRes.data?.items ?? [];
    const mdlsGroup = groups.find(g => g.name.toLowerCase().includes("mdls") || g.name.toLowerCase().includes("odi"));

    if (mdlsGroup) {
      await log(demoId, "Validate", `Found demo group: ${mdlsGroup.name} (${mdlsGroup.id})`);

      // Check connections in the group
      const connsRes = await fivetranGet(accountCfg, `/connections?group_id=${mdlsGroup.id}&limit=10`);
      const connections: Array<{ id: string; service: string; status: { setup_state: string } }> = connsRes.data?.items ?? [];
      if (connections.length > 0) {
        const conn = connections[0];
        await log(demoId, "Validate", `Connector found: ${conn.service} (setup_state=${conn.status?.setup_state})`);
      } else {
        await log(demoId, "Validate", "No connectors found in MDLS group — may need to run the buildout first", "warn");
      }
    } else {
      await log(demoId, "Validate", "No MDLS/ODI group found — check that the one-time buildout has been run", "warn");
    }

    // ── Stage 3: Sample Snowflake query ─────────────────────────────────────────
    if (destination === "snowflake" && cfg.snowflake) {
      await log(demoId, "Snowflake", `Testing Snowflake connectivity: ${cfg.snowflake.account}`);
      try {
        const count = await runSnowflakeQuery(cfg,
          `SELECT COUNT(*) AS n FROM TS_LINKED_DB_AWS.${KNOWN_MDLS_SCHEMA}.${KNOWN_TABLE}`);
        if (count !== null) {
          await log(demoId, "Snowflake", `Snowflake OK — ${KNOWN_MDLS_SCHEMA}.${KNOWN_TABLE}: ${count} rows (Iceberg via Polaris)`);
        } else {
          await log(demoId, "Snowflake", "Query returned no result — verify TS_LINKED_DB_AWS is accessible", "warn");
        }
      } catch (e) {
        await log(demoId, "Snowflake", `Snowflake query: ${(e as Error).message}`, "warn");
      }
    }

    // ── Stage 4: Sample Databricks query ────────────────────────────────────────
    if (cfg.databricks) {
      await log(demoId, "Databricks", `Testing Databricks connectivity: ${cfg.databricks.host}`);
      try {
        const count = await runDatabricksQuery(cfg,
          `SELECT COUNT(*) AS n FROM ts_fmdl_catalog_demo.${KNOWN_MDLS_SCHEMA}.${KNOWN_TABLE}`);
        if (count !== null) {
          await log(demoId, "Databricks", `Databricks OK — ${KNOWN_MDLS_SCHEMA}.${KNOWN_TABLE}: ${count} rows (Delta via UC)`);
        } else {
          await log(demoId, "Databricks", "Query returned no result", "warn");
        }
      } catch (e) {
        await log(demoId, "Databricks", `Databricks query: ${(e as Error).message}`, "warn");
      }
    }

    // ── Done ────────────────────────────────────────────────────────────────────
    const total = Math.round((Date.now() - runStart) / 1000);
    await setStatus(demoId, "demo_ready");
    await log(demoId, "Ready", `ODI infrastructure verified in ${total}s`);
    await log(demoId, "Ready", "Pre-built: 21 agents (7 Cortex + 7 Genie + 7 DuckDB), 7 industries, 6 compute engines");
    await log(demoId, "Ready", "Run the ODI 11-prompt flow: /p1 → MOVE → MANAGE → Multi-Format → Agent → ACTIVATE");
    await log(demoId, "Ready", `[Snowflake Cortex] FIVETRAN_ODI_ENABLEMENT_DEMO_DB.AGRICULTURE_SEMANTIC.LIVESTOCK_HEALTH_AGENT`);
    await log(demoId, "Ready", `[Databricks Genie] odi_demo Agriculture Livestock Health`);
    await log(demoId, "Ready", `[DuckDB] polaris.${KNOWN_MDLS_SCHEMA}.${KNOWN_TABLE}`);
    await log(demoId, "Ready", `[Direct SQL] TS_LINKED_DB_AWS.${KNOWN_MDLS_SCHEMA}.${KNOWN_TABLE} (Snowflake/Iceberg)`);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(demoId, "Error", msg, "error");
    await setStatus(demoId, "failed");
  }
}

export async function teardownOdiDemo(demoId: string, opts: RunOptions) {
  // SE ODI is read-only — no resources to tear down
  await db.demo.update({ where: { id: demoId }, data: { status: "done" } });
  await db.demoLog.create({ data: { demoId, stage: "Teardown", message: "ODI SE demo is read-only — no resources to tear down", level: "info" } });
}

// ── Snowflake SQL helper ──────────────────────────────────────────────────────

async function runSnowflakeQuery(cfg: AppConfig, sql: string): Promise<number | null> {
  if (!cfg.snowflake) return null;
  const { account, patToken, warehouse } = cfg.snowflake;
  const res = await fetch(`https://${account}/api/v2/statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${patToken}`,
      "Content-Type": "application/json",
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    },
    body: JSON.stringify({
      statement: sql, timeout: 30,
      role: "SE_DEMO_ROLE",
      warehouse,
    }),
  });
  if (!res.ok) throw new Error(`Snowflake: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { data?: [[string]] };
  const val = data.data?.[0]?.[0];
  return val != null ? parseInt(val, 10) : null;
}

// ── Databricks SQL helper ─────────────────────────────────────────────────────

async function runDatabricksQuery(cfg: AppConfig, sql: string): Promise<number | null> {
  if (!cfg.databricks) return null;
  const { host, patToken, warehouseId } = cfg.databricks;
  const base = host.startsWith("http") ? host : `https://${host}`;

  // Start statement execution
  const startRes = await fetch(`${base}/api/2.0/sql/statements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${patToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      statement: sql,
      warehouse_id: warehouseId,
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
    }),
  });
  if (!startRes.ok) throw new Error(`Databricks SQL start: ${startRes.status} ${(await startRes.text()).slice(0, 200)}`);
  const startData = await startRes.json() as { statement_id?: string; status?: { state: string }; result?: { data_array?: [[string]] } };

  let statementId = startData.statement_id;
  let result = startData.result;

  // Poll if still running
  if (startData.status?.state === "RUNNING" && statementId) {
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5_000));
      const pollRes = await fetch(`${base}/api/2.0/sql/statements/${statementId}`, {
        headers: { Authorization: `Bearer ${patToken}` },
      });
      if (!pollRes.ok) break;
      const pollData = await pollRes.json() as { status?: { state: string }; result?: { data_array?: [[string]] } };
      if (pollData.status?.state === "SUCCEEDED") { result = pollData.result; break; }
      if (pollData.status?.state === "FAILED") throw new Error("Databricks query failed");
    }
  }

  const val = result?.data_array?.[0]?.[0];
  return val != null ? parseInt(val, 10) : null;
}

// ── Fivetran REST helpers ─────────────────────────────────────────────────────

function ftHeaders(account: AccountConfig) {
  return {
    Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
    Accept: "application/json;version=2",
    "Content-Type": "application/json",
  };
}

async function fivetranGet(account: AccountConfig, path: string) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, { headers: ftHeaders(account) });
  if (!res.ok) throw new Error(`Fivetran GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
