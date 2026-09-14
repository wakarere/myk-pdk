/**
 * ODI "Any-Agent" demo runner for partner deployments.
 *
 * Builds on MDLS: same GCS lake + Snowflake Iceberg catalog,
 * then adds Databricks Unity Catalog attach (pre-sync) and
 * a Genie Space (post-sync) so partners can demo all three agent backends.
 *
 * Phases:
 *  1.  Preflight
 *  2.  Fivetran group + GCS bucket
 *  3.  MDLS destination (managed_data_lake, GCS)
 *  4.  Wait for destination connected + capture SA + Polaris creds
 *  5.  Grant Fivetran SA objectAdmin on bucket
 *  6.  Attach Databricks Unity Catalog (pre-sync, so tables appear after first sync)
 *  7.  PostgreSQL connector → shared SE demo DB
 *  8.  Schema narrowed to agriculture.agr_records, sync triggered + wait
 *  9.  Snowflake catalog integration + linked DB
 * 10.  Create Databricks Genie Space
 * 11.  QA gate + demo SQL instructions
 */

import { db } from "@/lib/db";
import type { OrgConfig } from "@prisma/client";

const DEMO_DB_HOST = "34.94.122.157";
const DEMO_DB_PORT = 5432;
const DEMO_DB_NAME = "industry-se-demo";
const DEMO_DB_USER = "fivetran";
const DEMO_DB_PASS = "2PcnxqFrHh64WKbfsYDU";

async function log(demoId: string, stage: string, message: string, level: "info" | "warn" | "error" = "info") {
  await db.demoLog.create({ data: { demoId, stage, message, level } });
}
async function setStatus(demoId: string, status: string) {
  await db.demo.update({ where: { id: demoId }, data: { status } });
}
async function addResource(demoId: string, type: string, resourceId: string, name: string) {
  await db.demoResource.create({ data: { demoId, type, resourceId, name } });
}

export async function runOdiDemo(demoId: string) {
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) {
    await setStatus(demoId, "failed");
    await log(demoId, "Error", "Setup not complete - org config not found", "error");
    return;
  }
  const account = { apiKey: cfg.fivetranApiKey, apiSecret: cfg.fivetranApiSecret };

  try {
    const runStart = Date.now();
    const s = () => `+${Math.round((Date.now() - runStart) / 1000)}s`;
    const laps: { label: string; t: number }[] = [];
    const lap = (label: string) => { laps.push({ label, t: Math.round((Date.now() - runStart) / 1000) }); };

    // ── Stage 1: Preflight ──────────────────────────────────────────────────────
    await setStatus(demoId, "preflight_running");
    await log(demoId, "Preflight", "Running preflight checks...");

    if (!cfg.gcpProjectId) throw new Error("GCP Project ID is required for ODI (GCS lake)");
    const gcpToken = await getGcpToken(cfg);
    const storageApiRes = await fetch(
      `https://serviceusage.googleapis.com/v1/projects/${cfg.gcpProjectId}/services/storage.googleapis.com`,
      { headers: { Authorization: `Bearer ${gcpToken}` } }
    );
    const storageApiData = await storageApiRes.json() as { state?: string };
    if (storageApiData.state !== "ENABLED") {
      throw new Error("Cloud Storage API not enabled. Run: gcloud services enable storage.googleapis.com");
    }

    lap("Preflight");
    await log(demoId, "Preflight", `All preflight checks passed (${s()})`);

    // ── Stage 2: Fivetran group + GCS bucket ───────────────────────────────────
    await setStatus(demoId, "provisioning");

    const demo = await db.demo.findUniqueOrThrow({ where: { id: demoId } });
    const shortId = demo.runId.slice(0, 8);
    const resourceBase = demo.label?.trim() || `pdk-odi-${shortId}`;
    const ftName = `odi_${resourceBase.replace(/-/g, "_")}`;
    const groupName = ftName;
    const bucketName = `pdk-odi-${shortId}`;
    const prefix = `odi-demo/${ftName}`;
    const fivetranRegion = gcpZoneToFivetranRegion(cfg.gcpZone ?? "us-central1-a");
    const gcpLocation = gcpZoneToGcpLocation(cfg.gcpZone ?? "us-central1-a");

    await log(demoId, "Group", `Creating Fivetran group: ${groupName}`);
    const groupRes = await fivetranPost(account, "/groups", { name: groupName });
    const groupId: string = groupRes.data.id;
    await addResource(demoId, "ft_group", groupId, groupName);

    await log(demoId, "GCS", `Creating GCS bucket: ${bucketName} (${gcpLocation})...`);
    await createGcsBucket(gcpToken, cfg.gcpProjectId!, bucketName, gcpLocation);
    await addResource(demoId, "gcs_bucket", bucketName, bucketName);
    lap("Group + Bucket");
    await log(demoId, "GCS", `GCS bucket ready: gs://${bucketName}/${prefix} (${s()})`);

    // ── Stage 3: MDLS destination ───────────────────────────────────────────────
    await log(demoId, "MDLS Destination", `Creating MDLS destination (GCS, region=${fivetranRegion})...`);
    const destRes = await fivetranPost(account, "/destinations", {
      group_id: groupId,
      service: "managed_data_lake",
      region: fivetranRegion,
      run_setup_tests: true,
      time_zone_offset: "0",
      config: {
        storage_provider: "GCS",
        bucket: bucketName,
        prefix_path: prefix,
        gcs_project_id: cfg.gcpProjectId,
      },
    });
    const destId: string = destRes.data.id;
    await addResource(demoId, "ft_destination", destId, groupName);
    await log(demoId, "MDLS Destination", `Destination created: ${destId}`);

    // ── Stage 4: Wait for connected + capture creds ─────────────────────────────
    const { fivetranSa, polarisClientId, polarisClientSecret, polarisCatalogUri, polarisTokenUri } =
      await waitForDestinationConnected(account, destId, groupId, async (msg) => log(demoId, "MDLS Destination", msg));

    lap("MDLS Destination");
    await log(demoId, "MDLS Destination", `Destination connected (${s()})`);

    // ── Stage 5: Grant IAM ──────────────────────────────────────────────────────
    if (fivetranSa) {
      try {
        const freshToken = await getGcpToken(cfg);
        await grantBucketIam(freshToken, bucketName, fivetranSa);
        await log(demoId, "GCS IAM", `Granted storage.objectAdmin to ${fivetranSa}`);
        try {
          await fivetranPost(account, `/destinations/${destId}/test`, {});
          await waitForDestinationSetupStatus(account, destId, 120_000);
          await log(demoId, "GCS IAM", "Setup tests passed after IAM grant");
        } catch (e) {
          await log(demoId, "GCS IAM", `Setup test re-run: ${(e as Error).message}`, "warn");
        }
      } catch (e) {
        await log(demoId, "GCS IAM", `IAM grant: ${(e as Error).message}`, "warn");
      }
    }

    // ── Stage 6: Attach Databricks Unity Catalog (pre-sync) ────────────────────
    let ucCatalogName: string | null = null;
    let genieSpaceId: string | null = null;

    if (cfg.databricksHost && cfg.databricksPatToken && cfg.databricksWarehouseId) {
      await log(demoId, "Databricks", "Attaching Databricks Unity Catalog (pre-sync — tables appear after first sync)...");
      ucCatalogName = `ft_odi_${destId}`;
      try {
        await fivetranPatch(account, `/destinations/${destId}`, {
          config: {
            should_maintain_tables_in_databricks: true,
            uc_catalog_name: ucCatalogName,
            databricks_server_host_name: cfg.databricksHost.replace(/^https?:\/\//, ""),
            databricks_http_path: `/sql/1.0/warehouses/${cfg.databricksWarehouseId}`,
            databricks_personal_access_token: cfg.databricksPatToken,
          },
        });
        await log(demoId, "Databricks", `UC catalog configured: ${ucCatalogName} — Fivetran will populate it during sync`);
        await addResource(demoId, "databricks_uc_catalog", ucCatalogName, ucCatalogName);
      } catch (e) {
        await log(demoId, "Databricks", `UC attach: ${(e as Error).message} — Genie space will be skipped`, "warn");
        ucCatalogName = null;
      }
    } else {
      await log(demoId, "Databricks", "Databricks not configured — skipping UC attach and Genie space");
    }

    // ── Stage 7: PostgreSQL connector ──────────────────────────────────────────
    await log(demoId, "Connector", "Creating PostgreSQL connector → shared SE demo database...");
    const schemaPrefix = "odi_demo";
    const connRes = await fivetranPost(account, "/connections", {
      group_id: groupId,
      service: "postgres",
      paused: true,
      sync_frequency: 360,
      config: {
        schema_prefix: schemaPrefix,
        host: DEMO_DB_HOST,
        port: DEMO_DB_PORT,
        database: DEMO_DB_NAME,
        user: DEMO_DB_USER,
        password: DEMO_DB_PASS,
        auth_method: "PASSWORD",
        update_method: "XMIN",
        always_encrypted: false,
        connection_type: "Directly",
      },
    });
    const connId: string = connRes.data.id;
    await addResource(demoId, "ft_connection", connId, schemaPrefix);
    await log(demoId, "Connector", `Connection created: ${connId}`);

    // ── Stage 8: Setup test + cert approval ────────────────────────────────────
    await log(demoId, "Connector", "Running setup tests to approve any TLS certificates...");
    try {
      const testResult = await fivetranPost(account, `/connections/${connId}/test`, {});
      const setupTests = (testResult.data?.setup_tests ?? []) as Array<{
        title: string; status: string;
        details?: Array<{ hash?: string; name?: string }>;
      }>;
      for (const test of setupTests) {
        if (test.status === "FAILED" && test.details?.length) {
          for (const detail of test.details) {
            if (detail.hash) {
              await log(demoId, "Connector", `Approving cert fingerprint for "${test.title}": ${detail.name ?? detail.hash.slice(0, 20)}...`);
              try {
                await fivetranPost(account, `/connections/${connId}/fingerprints`, {
                  hash: detail.hash,
                  public_key: "fivetran",
                });
                await log(demoId, "Connector", "Certificate fingerprint approved");
              } catch (e) {
                await log(demoId, "Connector", `Cert approval: ${(e as Error).message}`, "warn");
              }
            }
          }
        }
      }
      const retest = await fivetranPost(account, `/connections/${connId}/test`, {});
      const allPassed = (retest.data?.setup_tests ?? []).every(
        (t: { status: string }) => t.status === "PASSED" || t.status === "SKIPPED"
      );
      await log(demoId, "Connector", allPassed ? "All setup tests passed" : "Setup tests: some still failing (will proceed)", allPassed ? "info" : "warn");
    } catch (e) {
      await log(demoId, "Connector", `Setup test run: ${(e as Error).message} — continuing`, "warn");
    }

    // Schema narrowing (non-fatal)
    try {
      await fivetranPatch(account, `/connections/${connId}/schemas`, {
        schema_change_handling: "BLOCK_ALL",
        schemas: {
          agriculture: {
            enabled: true,
            tables: { agr_records: { enabled: true } },
          },
        },
      });
      await log(demoId, "Connector", "Schema narrowed to agriculture.agr_records");
    } catch {
      await log(demoId, "Connector", "Pre-sync schema narrowing skipped — will use full schema", "warn");
    }
    lap("Connector");

    // Unpause → Fivetran runs setup tests then schedules sync
    await fivetranPatch(account, `/connections/${connId}`, { paused: false });
    try {
      await waitForSetupState(account, connId, "connected", 300_000);
      await log(demoId, "Connector", "Setup tests passed");
    } catch {
      await log(demoId, "Connector", "Setup state check timed out — proceeding", "warn");
    }
    await fivetranPost(account, `/connections/${connId}/sync`, { force: true });
    await log(demoId, "Sync", "Initial sync triggered — agriculture.agr_records → GCS (Delta + Iceberg + Parquet)...");
    await log(demoId, "Sync", "Databricks reads Delta; Snowflake + DuckDB read Iceberg; same Parquet files underneath.");

    const syncResult = await waitForSync(account, connId, 1_200_000);
    lap("Sync");
    if (syncResult.succeeded_at) {
      await log(demoId, "Sync", `Sync complete (${s()})`);
    } else if (syncResult.failed_at) {
      await log(demoId, "Sync", `Sync failed: failed_at=${syncResult.failed_at}`, "warn");
    } else {
      await log(demoId, "Sync", `Sync timed out — sync_state=${syncResult.sync_state}`, "warn");
    }

    // ── Stage 9: Snowflake catalog integration + linked DB ──────────────────────
    const dbName = `FT_ODI_${destId.toUpperCase()}_DB`;
    if (cfg.destination === "snowflake" && polarisClientId && polarisClientSecret && polarisCatalogUri && polarisTokenUri) {
      await log(demoId, "Snowflake", "Creating Snowflake CATALOG INTEGRATION + linked database...");
      try {
        await attachSnowflakeToCatalog(cfg, destId, polarisClientId, polarisClientSecret, polarisCatalogUri, polarisTokenUri, "ODI");
        lap("Snowflake");
        await log(demoId, "Snowflake", `Linked DB: ${dbName}`);
        await log(demoId, "Snowflake", `Query: SELECT COUNT(*) FROM ${dbName}."odi_demo_agriculture"."agr_records"`);
      } catch (e) {
        await log(demoId, "Snowflake", `Catalog integration: ${(e as Error).message}`, "warn");
      }
    } else if (cfg.destination === "snowflake" && !polarisClientId) {
      await log(demoId, "Snowflake", "Polaris credentials not captured — Snowflake attach skipped", "warn");
    }

    // ── Stage 10: Databricks Genie Space (post-sync) ───────────────────────────
    if (ucCatalogName && cfg.databricksHost && cfg.databricksPatToken && cfg.databricksWarehouseId) {
      await log(demoId, "Genie", "Creating Databricks Genie Space...");
      try {
        // Wait a moment for Unity Catalog tables to register after sync
        await new Promise(r => setTimeout(r, 10_000));
        const tableId = `${ucCatalogName}.odi_demo_agriculture.agr_records`;
        genieSpaceId = await createGenieSpace(
          cfg.databricksHost,
          cfg.databricksPatToken,
          cfg.databricksWarehouseId,
          `ODI Demo — Agriculture (${resourceBase})`,
          "Agricultural records from Fivetran MDLS lake — demo any-agent story across Snowflake, Databricks, and DuckDB.",
          [tableId]
        );
        await addResource(demoId, "databricks_genie_space", genieSpaceId, `ODI Demo — Agriculture`);
        lap("Genie Space");
        await log(demoId, "Genie", `Genie Space created: ${genieSpaceId}`);
        await log(demoId, "Genie", `Table: ${tableId}`);
        await log(demoId, "Genie", "Sample questions: 'What are the top 5 livestock diseases?' / 'Show trends by region over time'");
      } catch (e) {
        await log(demoId, "Genie", `Genie Space: ${(e as Error).message}`, "warn");
      }
    }

    // ── Stage 11: QA gate + demo instructions ──────────────────────────────────
    await log(demoId, "QA Gate", "Verifying sync complete + destination connected...");
    const qaChecks = await runOdiQaGate(account, connId, destId);
    for (const c of qaChecks) {
      await log(demoId, "QA Gate", `${c.status.toUpperCase()} ${c.name}: ${c.detail}`, c.status === "pass" ? "info" : "warn");
    }
    lap("QA Gate");

    // ── Done ────────────────────────────────────────────────────────────────────
    const total = Math.round((Date.now() - runStart) / 1000);
    const summary = laps.map((l, i) => {
      const prev = i === 0 ? 0 : laps[i - 1].t;
      return `${l.label}: ${l.t - prev}s`;
    }).join(" · ");

    await setStatus(demoId, "demo_ready");
    await log(demoId, "Ready", `ODI demo ready in ${total}s — ${summary}`);
    await log(demoId, "Ready", `GCS lake: gs://${bucketName}/${prefix}/`);
    await log(demoId, "Ready", `Schema: odi_demo_agriculture.agr_records (750 rows)`);
    if (cfg.destination === "snowflake" && polarisClientId) {
      await log(demoId, "Ready", `[Engine 1 — Snowflake Iceberg] SELECT COUNT(*) FROM ${dbName}."odi_demo_agriculture"."agr_records"`);
    }
    if (ucCatalogName) {
      await log(demoId, "Ready", `[Engine 2 — Databricks Delta] SELECT COUNT(*) FROM ${ucCatalogName}.odi_demo_agriculture.agr_records`);
    }
    if (genieSpaceId) {
      await log(demoId, "Ready", `[Agent — Databricks Genie] Space ID: ${genieSpaceId}`);
    }
    await log(demoId, "Ready", `[Engine 3 — DuckDB Iceberg] ATTACH '${polarisCatalogUri ?? "https://api.fivetran.com/v1/destinations/<dest>/polaris/api/catalog/v1"}' AS polaris (TYPE ICEBERG, ...)`);
    await log(demoId, "Ready", "Run the ODI 11-prompt flow: MOVE → MANAGE → Multi-Format → Agent → ACTIVATE");
  } catch (e) {
    const err = e as any;
    const msg = err?.response?.data ? JSON.stringify(err.response.data) : e instanceof Error ? e.message : String(e);
    await log(demoId, "Error", msg, "error");
    await setStatus(demoId, "failed");
    await log(demoId, "Teardown", "Auto-teardown triggered after failure...");
    await teardownOdiDemo(demoId);
  }
}

export async function teardownOdiDemo(demoId: string) {
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) return;

  const account = { apiKey: cfg.fivetranApiKey, apiSecret: cfg.fivetranApiSecret };
  const resources = await db.demoResource.findMany({
    where: { demoId, status: "created" },
    orderBy: { createdAt: "desc" },
  });

  await log(demoId, "Teardown", `Starting teardown of ${resources.length} resources...`);

  for (const resource of resources) {
    try {
      if (resource.type === "databricks_genie_space") {
        if (cfg.databricksHost && cfg.databricksPatToken) {
          await log(demoId, "Teardown", `Deleting Genie Space: ${resource.resourceId}`);
          await deleteGenieSpace(cfg.databricksHost, cfg.databricksPatToken, resource.resourceId);
        }
      } else if (resource.type === "databricks_uc_catalog") {
        // UC catalog left in place — partner may want to inspect it. Log only.
        await log(demoId, "Teardown", `UC catalog ${resource.name} retained — drop manually: DROP CATALOG IF EXISTS ${resource.name} CASCADE`);
      } else if (resource.type === "ft_connection") {
        await log(demoId, "Teardown", `Deleting connection: ${resource.resourceId}`);
        await fivetranDelete(account, `/connections/${resource.resourceId}`);
      } else if (resource.type === "ft_destination") {
        await log(demoId, "Teardown", `Deleting MDLS destination: ${resource.resourceId}`);
        await fivetranDelete(account, `/destinations/${resource.resourceId}`);
      } else if (resource.type === "ft_group") {
        await log(demoId, "Teardown", `Deleting group: ${resource.resourceId}`);
        await fivetranDelete(account, `/groups/${resource.resourceId}`);
      } else if (resource.type === "gcs_bucket") {
        await log(demoId, "Teardown", `Deleting GCS bucket: ${resource.name}`);
        const token = await getGcpToken(cfg);
        await deleteGcsBucket(token, resource.name);
      }
      await db.demoResource.update({ where: { id: resource.id }, data: { status: "destroyed" } });
    } catch (e) {
      await log(demoId, "Teardown", `Failed: ${resource.type} ${resource.name}: ${(e as Error).message}`, "warn");
    }
  }

  await setStatus(demoId, "done");
  await log(demoId, "Teardown", "Teardown complete");
}

// ── QA Gate ──────────────────────────────────────────────────────────────────

interface QaCheck { name: string; status: "pass" | "fail"; detail: string }

async function runOdiQaGate(
  account: { apiKey: string; apiSecret: string },
  connId: string,
  destId: string
): Promise<QaCheck[]> {
  const checks: QaCheck[] = [];

  try {
    const conn = await fivetranGet(account, `/connections/${connId}`);
    const succeededAt = conn.data?.succeeded_at;
    const syncState = conn.data?.status?.sync_state;
    checks.push(succeededAt
      ? { name: "sync_complete", status: "pass", detail: `succeeded_at=${succeededAt}, sync_state=${syncState}` }
      : { name: "sync_complete", status: "fail", detail: `succeeded_at not set, sync_state=${syncState}` });
  } catch (e) {
    checks.push({ name: "sync_complete", status: "fail", detail: (e as Error).message });
  }

  try {
    const dest = await fivetranGet(account, `/destinations/${destId}`);
    const status = dest.data?.setup_status;
    checks.push(status === "connected"
      ? { name: "destination_connected", status: "pass", detail: `setup_status=${status}` }
      : { name: "destination_connected", status: "fail", detail: `setup_status=${status}` });
  } catch (e) {
    checks.push({ name: "destination_connected", status: "fail", detail: (e as Error).message });
  }

  return checks;
}

// ── Databricks Genie helpers ──────────────────────────────────────────────────

async function createGenieSpace(
  host: string,
  patToken: string,
  warehouseId: string,
  title: string,
  description: string,
  tableIdentifiers: string[]
): Promise<string> {
  const base = host.startsWith("http") ? host : `https://${host}`;

  const res = await fetch(`${base}/api/2.0/genie/spaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${patToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, description, warehouse_id: warehouseId }),
  });
  if (!res.ok) throw new Error(`Create Genie Space: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { id?: string; space_id?: string };
  const spaceId = data.id ?? data.space_id;
  if (!spaceId) throw new Error("Genie Space created but no ID returned");

  // Add tables
  if (tableIdentifiers.length > 0) {
    const tabRes = await fetch(`${base}/api/2.0/genie/spaces/${spaceId}/tables`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${patToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ table_identifiers: tableIdentifiers }),
    });
    if (!tabRes.ok) {
      // Non-fatal — space was created, tables just not linked
      const tabErr = await tabRes.text();
      throw new Error(`Genie Space created (${spaceId}) but table attach failed: ${tabRes.status} ${tabErr.slice(0, 200)}`);
    }
  }

  return spaceId;
}

async function deleteGenieSpace(host: string, patToken: string, spaceId: string) {
  const base = host.startsWith("http") ? host : `https://${host}`;
  const res = await fetch(`${base}/api/2.0/genie/spaces/${spaceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${patToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete Genie Space: ${res.status}`);
  }
}

// ── Snowflake helpers ─────────────────────────────────────────────────────────

async function buildSnowflakeJwt(cfg: OrgConfig): Promise<string> {
  const { createPrivateKey, createPublicKey, createHash, sign } = await import("crypto");
  const privateKey = createPrivateKey(cfg.snowflakePatToken!);
  const publicKey = createPublicKey(privateKey);
  const pubDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const fingerprint = "SHA256:" + createHash("sha256").update(pubDer).digest("base64");
  const accountId = cfg.snowflakeAccount!.replace(/\.snowflakecomputing\.com$/, "").toUpperCase();
  const user = cfg.snowflakeUser!.toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: `${accountId}.${user}.${fingerprint}`,
    sub: `${accountId}.${user}`,
    iat: now, exp: now + 3600,
  })).toString("base64url");
  const sig = sign("sha256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

async function attachSnowflakeToCatalog(
  cfg: OrgConfig,
  destId: string,
  clientId: string,
  clientSecret: string,
  catalogUri: string,
  tokenUri: string,
  prefix = "MDLS"
): Promise<void> {
  const dest = destId.toUpperCase();
  const integrationName = `FT_${prefix}_${dest}_CATINT`;
  const dbName = `FT_${prefix}_${dest}_DB`;

  const runSQL = async (sql: string) => {
    const jwt = await buildSnowflakeJwt(cfg);
    const res = await fetch(`https://${cfg.snowflakeAccount!}/api/v2/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
      },
      body: JSON.stringify({
        statement: sql, timeout: 60,
        role: "ACCOUNTADMIN",
        warehouse: cfg.snowflakeWarehouse ?? "HANDS_ON_LAB_WAREHOUSE",
      }),
    });
    if (!res.ok) throw new Error(`Snowflake SQL: ${res.status} ${(await res.text()).slice(0, 300)}`);
  };

  await runSQL(`
    CREATE OR REPLACE CATALOG INTEGRATION ${integrationName}
      CATALOG_SOURCE = POLARIS
      TABLE_FORMAT = ICEBERG
      CATALOG_NAMESPACE = '${destId}'
      REST_CONFIG = (
        CATALOG_URI = '${catalogUri}'
        WAREHOUSE = '${destId}'
      )
      REST_AUTHENTICATION = (
        TYPE = OAUTH
        OAUTH_TOKEN_URI = '${tokenUri}'
        OAUTH_CLIENT_ID = '${clientId}'
        OAUTH_CLIENT_SECRET = '${clientSecret}'
        OAUTH_ALLOWED_SCOPES = ('PRINCIPAL_ROLE:ALL')
      )
      ENABLED = TRUE
  `);
  await new Promise(r => setTimeout(r, 5_000));
  await runSQL(`CREATE DATABASE IF NOT EXISTS ${dbName} CATALOG = '${integrationName}'`);
}

// ── Destination wait helpers ─────────────────────────────────────────────────

interface PolarisCapture {
  fivetranSa: string | null;
  polarisClientId: string | null;
  polarisClientSecret: string | null;
  polarisCatalogUri: string | null;
  polarisTokenUri: string | null;
}

async function waitForDestinationConnected(
  account: { apiKey: string; apiSecret: string },
  destId: string,
  groupId: string,
  onLog: (msg: string) => Promise<void>,
  timeoutMs = 300_000
): Promise<PolarisCapture> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await fivetranGet(account, `/destinations/${destId}`);
    const setupStatus: string = data.data?.setup_status ?? "";
    const config = data.data?.config ?? {};

    if (setupStatus === "connected" || setupStatus === "incomplete") {
      const saFromConfig: string | null =
        config.service_account ?? config.gcs_service_account ?? config.catalog_service_account ?? null;
      const fivetranSa = saFromConfig ?? `g-${destId.replace(/_/g, "-")}@fivetran-production.iam.gserviceaccount.com`;

      const polarisClientId: string | null = config.catalog_oauth_client_id ?? config.polaris_client_id ?? config.oauth_client_id ?? null;
      const polarisClientSecret: string | null = config.catalog_oauth_client_secret ?? config.polaris_client_secret ?? config.oauth_client_secret ?? null;
      const polarisCatalogUri: string | null = config.catalog_rest_uri ?? config.polaris_catalog_uri ?? config.catalog_uri ?? `https://api.fivetran.com/v1/destinations/${destId}/polaris/api/catalog/v1`;
      const polarisTokenUri: string | null = config.catalog_oauth_token_uri ?? config.polaris_token_uri ?? config.oauth_token_uri ?? `https://api.fivetran.com/v1/destinations/${destId}/polaris/oauth/tokens`;

      await onLog(`Destination ${setupStatus} — config keys: ${Object.keys(config).join(", ")}`);
      await onLog(`Fivetran SA: ${fivetranSa}`);
      if (polarisClientId) await onLog("Polaris credentials captured");

      return { fivetranSa, polarisClientId, polarisClientSecret, polarisCatalogUri, polarisTokenUri };
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 30 === 0 && elapsed > 0) await onLog(`  ...waiting for destination (${elapsed}s)`);
    await new Promise(r => setTimeout(r, 10_000));
  }
  throw new Error("MDLS destination did not reach connected state within 5 minutes");
}

async function waitForDestinationSetupStatus(
  account: { apiKey: string; apiSecret: string },
  destId: string,
  timeoutMs: number
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await fivetranGet(account, `/destinations/${destId}`);
    if (data.data?.setup_status === "connected") return;
    await new Promise(r => setTimeout(r, 10_000));
  }
}

// ── GCP helpers ──────────────────────────────────────────────────────────────

async function getGcpToken(cfg: OrgConfig): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const opts = cfg.gcpKeyFilePath?.trim()
    ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
    : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
  const client = await new GoogleAuth(opts).getClient();
  const tokenRes = await (client as any).getAccessToken();
  return tokenRes.token as string;
}

async function createGcsBucket(token: string, project: string, bucket: string, location: string) {
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(project)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: bucket, location, storageClass: "STANDARD", iamConfiguration: { uniformBucketLevelAccess: { enabled: true } }, softDeletePolicy: { retentionDurationSeconds: 0 } }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("You already own this bucket")) return;
    throw new Error(`Create GCS bucket ${bucket}: ${res.status} ${text}`);
  }
}

async function grantBucketIam(token: string, bucket: string, serviceAccount: string) {
  const getRes = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/iam`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!getRes.ok) throw new Error(`Get bucket IAM: ${getRes.status}`);
  const policy = await getRes.json() as { bindings?: Array<{ role: string; members: string[] }>; etag?: string };

  const bindings = policy.bindings ?? [];
  const role = "roles/storage.objectAdmin";
  const member = `serviceAccount:${serviceAccount}`;
  const existing = bindings.find(b => b.role === role);
  if (existing) { if (!existing.members.includes(member)) existing.members.push(member); }
  else { bindings.push({ role, members: [member] }); }

  const putRes = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/iam`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...policy, bindings }),
    }
  );
  if (!putRes.ok) throw new Error(`Put bucket IAM: ${putRes.status} ${await putRes.text()}`);
}

async function deleteGcsBucket(token: string, bucket: string) {
  let pageToken: string | undefined;
  do {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o${pageToken ? `?pageToken=${pageToken}` : ""}`;
    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) break;
    const list = await listRes.json() as { items?: Array<{ name: string }>; nextPageToken?: string };
    pageToken = list.nextPageToken;
    for (const obj of list.items ?? []) {
      await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(obj.name)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    }
  } while (pageToken);
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Delete GCS bucket: ${res.status}`);
}

// ── Region mapping ────────────────────────────────────────────────────────────

function gcpZoneToFivetranRegion(zone: string): string {
  const region = zone.split("-").slice(0, -1).join("-");
  const map: Record<string, string> = {
    "us-central1": "GCP_US_CENTRAL1", "us-east1": "GCP_US_EAST4", "us-east4": "GCP_US_EAST4",
    "us-west1": "GCP_US_WEST1", "us-west2": "GCP_US_WEST2", "europe-west1": "GCP_EUROPE_WEST3",
    "europe-west2": "GCP_EUROPE_WEST2", "europe-west3": "GCP_EUROPE_WEST3",
    "australia-southeast1": "GCP_AUSTRALIA_SOUTHEAST1", "asia-southeast1": "GCP_ASIA_SOUTHEAST1",
    "asia-northeast1": "GCP_ASIA_NORTHEAST1",
  };
  return map[region] ?? "GCP_US_CENTRAL1";
}

function gcpZoneToGcpLocation(zone: string): string {
  return zone.split("-").slice(0, -1).join("-").toUpperCase();
}

// ── Fivetran REST helpers ─────────────────────────────────────────────────────

function ftHeaders(account: { apiKey: string; apiSecret: string }) {
  return {
    Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
    Accept: "application/json;version=2",
    "Content-Type": "application/json",
  };
}

async function fivetranGet(account: { apiKey: string; apiSecret: string }, path: string) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, { headers: ftHeaders(account) });
  if (!res.ok) throw new Error(`Fivetran GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fivetranPost(account: { apiKey: string; apiSecret: string }, path: string, body: unknown) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, {
    method: "POST", headers: ftHeaders(account), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Fivetran POST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fivetranPatch(account: { apiKey: string; apiSecret: string }, path: string, body: unknown) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, {
    method: "PATCH", headers: ftHeaders(account), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Fivetran PATCH ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fivetranDelete(account: { apiKey: string; apiSecret: string }, path: string) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, { method: "DELETE", headers: ftHeaders(account) });
  if (!res.ok && res.status !== 404) throw new Error(`Fivetran DELETE ${path}: ${res.status}`);
}

async function waitForSetupState(account: { apiKey: string; apiSecret: string }, connId: string, target: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await fivetranGet(account, `/connections/${connId}`);
    if (data.data?.status?.setup_state === target) return;
    await new Promise(r => setTimeout(r, 10_000));
  }
  throw new Error(`Connection did not reach setup_state=${target}`);
}

async function waitForSchemas(account: { apiKey: string; apiSecret: string }, connId: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await fivetranGet(account, `/connections/${connId}/schemas`);
      if (Object.keys(data.data?.schemas ?? {}).length > 0) return;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 10_000));
  }
}

async function waitForSync(
  account: { apiKey: string; apiSecret: string },
  connId: string,
  timeoutMs: number
): Promise<{ succeeded_at: string | null; failed_at: string | null; sync_state: string | null }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await fivetranGet(account, `/connections/${connId}`);
    const syncState: string = data.data?.status?.sync_state ?? "";
    const succeededAt: string | null = data.data?.succeeded_at ?? null;
    const failedAt: string | null = data.data?.failed_at ?? null;
    if (syncState !== "syncing" && (succeededAt || failedAt)) return { succeeded_at: succeededAt, failed_at: failedAt, sync_state: syncState };
    await new Promise(r => setTimeout(r, 15_000));
  }
  return { succeeded_at: null, failed_at: null, sync_state: "timeout" };
}
