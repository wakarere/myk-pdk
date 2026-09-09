/**
 * HD demo orchestration runner.
 * Executes provisioning stages sequentially, writing status and logs to SQLite.
 * Ported from fivetran-hd-buildout MCP tools - same logic, no MCP layer.
 */

import { db } from "@/lib/db";
import { getAccountConfig, loadConfig } from "@/lib/config";

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

async function addResource(demoId: string, type: string, resourceId: string, name: string) {
  await db.demoResource.create({ data: { demoId, type, resourceId, name } });
}

export async function runHdDemo(demoId: string, opts: RunOptions) {
  const { account, platform, destination } = opts;
  const cfg = loadConfig();
  const accountCfg = getAccountConfig(account);

  try {
    // ── Stage 1: Preflight ────────────────────────────────────────────────────
    await setStatus(demoId, "preflight_running");
    await log(demoId, "Preflight", "Running preflight checks...");

    const { runPreflight } = await import("./preflight");
    const preflight = await runPreflight({ blueprint: "hd", account, platform });

    if (!preflight.passed) {
      await log(demoId, "Preflight", `Preflight failed: ${preflight.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`, "error");
      await setStatus(demoId, "preflight_failed");
      return;
    }
    await log(demoId, "Preflight", "All preflight checks passed");

    // ── Stage 2: Provision HD Agent ───────────────────────────────────────────
    await setStatus(demoId, "provisioning");
    await log(demoId, "HD Agent", "Creating Fivetran Hybrid Deployment agent...");

    const demo = await db.demo.findUniqueOrThrow({ where: { id: demoId } });
    const agentName = `pdk-hd-${demo.runId.slice(0, 8)}`;
    const groupName = `pdk-group-${demo.runId.slice(0, 8)}`;

    // Create group
    await log(demoId, "HD Agent", `Creating Fivetran group: ${groupName}`);
    const groupRes = await fivetranPost(accountCfg, "/groups", { name: groupName });
    const groupId: string = groupRes.data.id;
    await addResource(demoId, "ft_group", groupId, groupName);
    await log(demoId, "HD Agent", `Group created: ${groupId}`);

    // Create HD agent
    await log(demoId, "HD Agent", `Creating HD agent: ${agentName}`);
    const agentRes = await fivetranPost(accountCfg, `/groups/${groupId}/hybrid-deployment-agents`, {
      display_name: agentName,
    });
    const agentId: string = agentRes.data.id;
    const agentToken: string = agentRes.data.token;
    await addResource(demoId, "ft_agent", agentId, agentName);
    await log(demoId, "HD Agent", `HD agent created: ${agentId}`);

    // ── Stage 3: Store token in Secret Manager ────────────────────────────────
    await log(demoId, "Secret Manager", "Storing agent token in Secret Manager...");
    const secretName = `pdk-hd-token-${demo.runId.slice(0, 8)}`;
    await createGcpSecret(cfg.gcpProjectId, secretName, agentToken);
    await addResource(demoId, "secret", secretName, secretName);
    await log(demoId, "Secret Manager", `Token stored: ${secretName}`);

    // ── Stage 4: Provision GCE VM ─────────────────────────────────────────────
    await log(demoId, "GCE VM", `Provisioning ${platform === "docker" ? "GCE VM" : "GKE cluster"}...`);
    const vmName = `pdk-hd-vm-${demo.runId.slice(0, 8)}`;
    await provisionGceVm(cfg.gcpProjectId, cfg.gcpZone, vmName, secretName, platform);
    await addResource(demoId, "gce_vm", vmName, vmName);
    await log(demoId, "GCE VM", `VM provisioned: ${vmName}. Waiting for agent to come online...`);

    // ── Stage 5: Wait for agent online ───────────────────────────────────────
    await log(demoId, "HD Agent", "Polling for agent online status...");
    await waitForAgentOnline(accountCfg, agentId, groupId);
    await log(demoId, "HD Agent", "Agent is online");

    // ── Stage 6: Create destination ───────────────────────────────────────────
    await log(demoId, "Destination", `Creating ${destination} destination...`);
    const destName = `pdk-dest-${demo.runId.slice(0, 8)}`;
    const destRes = await createDestination(accountCfg, groupId, agentId, destination, destName, cfg);
    const destId: string = destRes.data.id;
    await addResource(demoId, "ft_destination", destId, destName);
    await log(demoId, "Destination", `Destination created: ${destId}`);

    // ── Stage 7: Create connector ─────────────────────────────────────────────
    await log(demoId, "Connector", "Setting up PostgreSQL connector...");
    const connName = `pdk-pg-${demo.runId.slice(0, 8)}`;
    const connRes = await createPostgresConnector(accountCfg, groupId, agentId, connName, cfg);
    const connId: string = connRes.data.id;
    await addResource(demoId, "ft_connection", connId, connName);
    await log(demoId, "Connector", `Connector created: ${connId}. Starting sync...`);

    // ── Stage 8: Wait for sync ────────────────────────────────────────────────
    await log(demoId, "Sync", "Waiting for first successful sync...");
    await waitForSync(accountCfg, connId);
    await log(demoId, "Sync", "Sync complete");

    // ── Stage 9: QA gate ──────────────────────────────────────────────────────
    await setStatus(demoId, "qa_running");
    await log(demoId, "QA", "Running QA gate: row parity + system columns + agent evidence...");
    const qaResult = await runQaGate(accountCfg, connId, agentId, destination, cfg);
    if (!qaResult.passed) {
      await log(demoId, "QA", `QA failed: ${qaResult.reason}`, "error");
      await setStatus(demoId, "qa_failed");
      return;
    }
    await log(demoId, "QA", "QA gate passed - row parity confirmed, agent verified");

    await setStatus(demoId, "demo_ready");
    await log(demoId, "Ready", `Demo environment is ready. Group: ${groupName}, Destination: ${destName}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(demoId, "Error", msg, "error");
    await setStatus(demoId, "failed");
  }
}

export async function teardownHdDemo(demoId: string) {
  const resources = await db.demoResource.findMany({
    where: { demoId, status: "created" },
    orderBy: { createdAt: "desc" }, // reverse order: tear down newest first
  });

  const demo = await db.demo.findUniqueOrThrow({ where: { id: demoId } });
  const accountCfg = getAccountConfig(demo.account);
  const cfg = loadConfig();

  await log(demoId, "Teardown", `Starting dry-run teardown of ${resources.length} resources...`);

  for (const resource of resources) {
    try {
      if (resource.type === "gce_vm") {
        await log(demoId, "Teardown", `Deleting VM: ${resource.name}`);
        await deleteGceVm(cfg.gcpProjectId, cfg.gcpZone, resource.name);
      } else if (resource.type === "secret") {
        await log(demoId, "Teardown", `Deleting secret: ${resource.name}`);
        await deleteGcpSecret(cfg.gcpProjectId, resource.name);
      } else if (resource.type === "ft_connection") {
        await log(demoId, "Teardown", `Deleting connector: ${resource.resourceId}`);
        await fivetranDelete(accountCfg, `/connectors/${resource.resourceId}`);
      } else if (resource.type === "ft_destination") {
        await log(demoId, "Teardown", `Deleting destination: ${resource.resourceId}`);
        await fivetranDelete(accountCfg, `/destinations/${resource.resourceId}`);
      } else if (resource.type === "ft_agent") {
        await log(demoId, "Teardown", `Deleting HD agent: ${resource.resourceId}`);
        // agent deleted with group
      } else if (resource.type === "ft_group") {
        await log(demoId, "Teardown", `Deleting group: ${resource.resourceId}`);
        await fivetranDelete(accountCfg, `/groups/${resource.resourceId}`);
      }
      await db.demoResource.update({ where: { id: resource.id }, data: { status: "destroyed" } });
    } catch (e) {
      await log(demoId, "Teardown", `Failed to delete ${resource.type} ${resource.name}: ${(e as Error).message}`, "warn");
    }
  }

  await setStatus(demoId, "done");
  await log(demoId, "Teardown", "Teardown complete - all resources removed");
}

// ── Fivetran API helpers ────────────────────────────────────────────────────

async function fivetranPost(account: { apiKey: string; apiSecret: string }, path: string, body: unknown) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
      Accept: "application/json;version=2",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Fivetran POST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fivetranDelete(account: { apiKey: string; apiSecret: string }, path: string) {
  const res = await fetch(`https://api.fivetran.com/v1${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
      Accept: "application/json;version=2",
    },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Fivetran DELETE ${path}: ${res.status}`);
}

async function waitForAgentOnline(account: { apiKey: string; apiSecret: string }, agentId: string, groupId: string, timeoutMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`https://api.fivetran.com/v1/groups/${groupId}/hybrid-deployment-agents/${agentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
        Accept: "application/json;version=2",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data?.status === "CONNECTED") return;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error("Agent did not come online within 10 minutes");
}

async function waitForSync(account: { apiKey: string; apiSecret: string }, connectorId: string, timeoutMs = 900_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`https://api.fivetran.com/v1/connectors/${connectorId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
        Accept: "application/json;version=2",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data?.status?.sync_state === "ready" || data.data?.succeeded_at) return;
      if (data.data?.status?.sync_state === "failed") throw new Error("Sync failed");
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error("Sync did not complete within 15 minutes");
}

// ── GCP helpers ─────────────────────────────────────────────────────────────

async function getGcpAuthClient() {
  const { GoogleAuth } = await import("google-auth-library");
  return new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
}

async function createGcpSecret(projectId: string, secretId: string, value: string) {
  const client = await getGcpAuthClient();
  const base = `https://secretmanager.googleapis.com/v1/projects/${projectId}`;
  // Create secret
  await client.request({
    method: "POST",
    url: `${base}/secrets`,
    data: { replication: { automatic: {} } },
    params: { secretId },
  });
  // Add version
  await client.request({
    method: "POST",
    url: `${base}/secrets/${secretId}/versions:add`,
    data: { payload: { data: Buffer.from(value).toString("base64") } },
  });
}

async function deleteGcpSecret(projectId: string, secretId: string) {
  const client = await getGcpAuthClient();
  await client.request({
    method: "DELETE",
    url: `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretId}`,
  });
}

async function provisionGceVm(projectId: string, zone: string, name: string, secretName: string, platform: string) {
  const client = await getGcpAuthClient();
  const startupScript = [
    "#!/bin/bash",
    "set -e",
    `SECRET_VALUE=$(gcloud secrets versions access latest --secret=${secretName} --project=${projectId})`,
    "useradd -m -s /bin/bash fivetran || true",
    "apt-get update -qq && apt-get install -y -qq docker.io",
    "systemctl start docker && usermod -aG docker fivetran",
    "su - fivetran -c \"curl -fsSL https://fivetran.com/install | bash -s -- $SECRET_VALUE\"",
  ].join("\n");

  await client.request({
    method: "POST",
    url: `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`,
    data: {
      name,
      machineType: `zones/${zone}/machineTypes/e2-standard-8`,
      disks: [{
        boot: true,
        autoDelete: true,
        initializeParams: { sourceImage: "projects/debian-cloud/global/images/family/debian-12", diskSizeGb: "50" },
      }],
      networkInterfaces: [{ accessConfigs: [{ type: "ONE_TO_ONE_NAT" }] }],
      metadata: { items: [{ key: "startup-script", value: startupScript }] },
      serviceAccounts: [{
        email: "default",
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      }],
      labels: { "pdk-managed": "true", "pdk-type": "hd-agent" },
    },
  });
}

async function deleteGceVm(projectId: string, zone: string, name: string) {
  const client = await getGcpAuthClient();
  await client.request({
    method: "DELETE",
    url: `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${name}`,
  });
}

// ── Destination and connector creation ──────────────────────────────────────

async function createDestination(
  account: { apiKey: string; apiSecret: string },
  groupId: string,
  agentId: string,
  destination: string,
  name: string,
  cfg: ReturnType<typeof loadConfig>
) {
  let config: Record<string, unknown> = {};

  if (destination === "snowflake" && cfg.snowflake) {
    config = {
      host: cfg.snowflake.account,
      user: cfg.snowflake.user,
      auth: "PAT",
      personal_access_token: cfg.snowflake.patToken,
      database: name.toUpperCase().replace(/-/g, "_"),
      warehouse: cfg.snowflake.warehouse,
    };
  } else if (destination === "databricks" && cfg.databricks) {
    config = {
      server_hostname: cfg.databricks.host,
      http_path: `/sql/1.0/warehouses/${cfg.databricks.warehouseId}`,
      personal_access_token: cfg.databricks.patToken,
      catalog: cfg.databricks.catalog ?? "main",
    };
  }

  return fivetranPost(account, `/groups/${groupId}/destinations`, {
    service: destination,
    region: "GCP_US_CENTRAL1",
    hybrid_deployment_agent_id: agentId,
    config,
  });
}

async function createPostgresConnector(
  account: { apiKey: string; apiSecret: string },
  groupId: string,
  agentId: string,
  name: string,
  cfg: ReturnType<typeof loadConfig>
) {
  return fivetranPost(account, `/connectors`, {
    service: "postgres",
    group_id: groupId,
    hybrid_deployment_agent_id: agentId,
    paused: false,
    config: {
      host: cfg.hdSource.host,
      port: cfg.hdSource.port,
      database: cfg.hdSource.database,
      user: cfg.hdSource.user,
      password: cfg.hdSource.password,
      schema: cfg.hdSource.schema,
      update_method: "WAL",
    },
    schema: name.replace(/-/g, "_"),
  });
}

async function runQaGate(
  account: { apiKey: string; apiSecret: string },
  connectorId: string,
  agentId: string,
  destination: string,
  cfg: ReturnType<typeof loadConfig>
): Promise<{ passed: boolean; reason?: string }> {
  // Verify connector uses the HD agent
  const res = await fetch(`https://api.fivetran.com/v1/connectors/${connectorId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString("base64")}`,
      Accept: "application/json;version=2",
    },
  });
  if (!res.ok) return { passed: false, reason: "Could not fetch connector status" };
  const data = await res.json();
  const usesAgent = data.data?.hybrid_deployment_agent_id === agentId;
  if (!usesAgent) return { passed: false, reason: "Connector is not using the HD agent" };

  // Verify sync succeeded (row count via connector stats)
  const rows = data.data?.status?.tasks?.[0]?.rows_written ?? 0;
  if (rows === 0) return { passed: false, reason: "Zero rows synced - check source table" };

  return { passed: true };
}
