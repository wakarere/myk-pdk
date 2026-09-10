/**
 * HD demo orchestration runner for partner deployments.
 * Reads all credentials from OrgConfig (SQLite) - no env vars needed.
 * Partners bring their own Fivetran account, GCP project, and destination.
 */

import { db } from "@/lib/db";
import type { OrgConfig } from "@prisma/client";

async function log(demoId: string, stage: string, message: string, level: "info" | "warn" | "error" = "info") {
  await db.demoLog.create({ data: { demoId, stage, message, level } });
}

async function setStatus(demoId: string, status: string) {
  await db.demo.update({ where: { id: demoId }, data: { status } });
}

async function addResource(demoId: string, type: string, resourceId: string, name: string) {
  await db.demoResource.create({ data: { demoId, type, resourceId, name } });
}

export async function runHdDemo(demoId: string) {
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) {
    await setStatus(demoId, "failed");
    await log(demoId, "Error", "Setup not complete - org config not found", "error");
    return;
  }

  const account = { apiKey: cfg.fivetranApiKey, apiSecret: cfg.fivetranApiSecret };

  try {
    // ── Stage 1: Preflight ──────────────────────────────────────────────────────
    await setStatus(demoId, "preflight_running");
    await log(demoId, "Preflight", "Running preflight checks...");

    const { runPreflight } = await import("./preflight");
    const preflight = await runPreflight();

    if (!preflight.passed) {
      await log(demoId, "Preflight", `Preflight failed: ${preflight.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`, "error");
      await setStatus(demoId, "preflight_failed");
      return;
    }
    await log(demoId, "Preflight", "All preflight checks passed");

    // ── Stage 2: Provision HD Agent ─────────────────────────────────────────────
    await setStatus(demoId, "provisioning");
    await log(demoId, "HD Agent", "Creating Fivetran Hybrid Deployment agent...");

    const demo = await db.demo.findUniqueOrThrow({ where: { id: demoId } });
    const shortId = demo.runId.slice(0, 8);
    const agentName = `pdk_hd_${shortId}`;
    const groupName = `pdk_group_${shortId}`;

    await log(demoId, "HD Agent", `Creating Fivetran group: ${groupName}`);
    const groupRes = await fivetranPost(account, "/groups", { name: groupName });
    const groupId: string = groupRes.data.id;
    await addResource(demoId, "ft_group", groupId, groupName);
    await log(demoId, "HD Agent", `Group created: ${groupId}`);

    await log(demoId, "HD Agent", `Creating HD agent: ${agentName}`);
    const agentRes = await fivetranPost(account, `/groups/${groupId}/hybrid-deployment-agents`, {
      display_name: agentName,
    });
    const agentId: string = agentRes.data.id;
    const agentToken: string = agentRes.data.token;
    await addResource(demoId, "ft_agent", agentId, agentName);
    await log(demoId, "HD Agent", `HD agent created: ${agentId}`);

    // ── Stage 3: Store token in Secret Manager ──────────────────────────────────
    await log(demoId, "Secret Manager", "Storing agent token in Secret Manager...");
    const secretName = `pdk-hd-token-${shortId}`;
    await createGcpSecret(cfg, secretName, agentToken);
    await addResource(demoId, "secret", secretName, secretName);
    await log(demoId, "Secret Manager", `Token stored: ${secretName}`);

    // ── Stage 4: Provision GCE VM ───────────────────────────────────────────────
    const vmName = `pdk-hd-vm-${shortId}`;
    await log(demoId, "GCE VM", `Provisioning GCE VM: ${vmName}...`);
    await provisionGceVm(cfg, vmName, secretName);
    await addResource(demoId, "gce_vm", vmName, vmName);
    await log(demoId, "GCE VM", `VM provisioned: ${vmName}. Waiting for agent to come online...`);

    // ── Stage 5: Wait for agent online ──────────────────────────────────────────
    await log(demoId, "HD Agent", "Polling for agent online status (may take 5-10 min)...");
    await waitForAgentOnline(account, agentId, groupId);
    await log(demoId, "HD Agent", "Agent is online");

    // ── Stage 6: Create destination ─────────────────────────────────────────────
    await log(demoId, "Destination", `Creating ${cfg.destination} destination...`);
    const destName = `pdk-dest-${shortId}`;
    const destRes = await createDestination(account, groupId, agentId, destName, cfg);
    const destId: string = destRes.data.id;
    await addResource(demoId, "ft_destination", destId, destName);
    await log(demoId, "Destination", `Destination created: ${destId}`);

    // HD is the demo: agent online + destination created is the deliverable.
    // No source connector needed - the story is the agent running in the partner's GCP.
    await setStatus(demoId, "demo_ready");
    await log(demoId, "Ready", `HD agent online and destination ready. Group: ${groupName}, Destination: ${destName}`);
    await log(demoId, "Ready", `Open Fivetran dashboard to show agent status CONNECTED and destination ${destName} in group ${groupName}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(demoId, "Error", msg, "error");
    await setStatus(demoId, "failed");
  }
}

export async function teardownHdDemo(demoId: string) {
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
      if (resource.type === "gce_vm") {
        await log(demoId, "Teardown", `Deleting VM: ${resource.name}`);
        await deleteGceVm(cfg, resource.name);
      } else if (resource.type === "secret") {
        await log(demoId, "Teardown", `Deleting secret: ${resource.name}`);
        await deleteGcpSecret(cfg, resource.name);
      } else if (resource.type === "ft_connection") {
        await log(demoId, "Teardown", `Deleting connector: ${resource.resourceId}`);
        await fivetranDelete(account, `/connectors/${resource.resourceId}`);
      } else if (resource.type === "ft_destination") {
        await log(demoId, "Teardown", `Deleting destination: ${resource.resourceId}`);
        await fivetranDelete(account, `/destinations/${resource.resourceId}`);
      } else if (resource.type === "ft_group") {
        await log(demoId, "Teardown", `Deleting group: ${resource.resourceId}`);
        await fivetranDelete(account, `/groups/${resource.resourceId}`);
      }
      await db.demoResource.update({ where: { id: resource.id }, data: { status: "destroyed" } });
    } catch (e) {
      await log(demoId, "Teardown", `Failed to delete ${resource.type} ${resource.name}: ${(e as Error).message}`, "warn");
    }
  }

  await setStatus(demoId, "done");
  await log(demoId, "Teardown", "Teardown complete - all resources removed");
}

// ── Fivetran API helpers ─────────────────────────────────────────────────────

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

async function waitForAgentOnline(
  account: { apiKey: string; apiSecret: string },
  agentId: string,
  groupId: string,
  timeoutMs = 600_000
) {
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

// ── GCP helpers ──────────────────────────────────────────────────────────────

async function getGcpAuthClient(cfg: OrgConfig) {
  const { GoogleAuth } = await import("google-auth-library");
  const authOptions = cfg.gcpKeyFilePath?.trim()
    ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
    : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
  return new GoogleAuth(authOptions).getClient();
}

async function createGcpSecret(cfg: OrgConfig, secretId: string, value: string) {
  const client = await getGcpAuthClient(cfg);
  const base = `https://secretmanager.googleapis.com/v1/projects/${cfg.gcpProjectId}`;
  await client.request({
    method: "POST",
    url: `${base}/secrets`,
    data: { replication: { automatic: {} } },
    params: { secretId },
  });
  await client.request({
    method: "POST",
    url: `${base}/secrets/${secretId}/versions:add`,
    data: { payload: { data: Buffer.from(value).toString("base64") } },
  });
}

async function deleteGcpSecret(cfg: OrgConfig, secretId: string) {
  const client = await getGcpAuthClient(cfg);
  await client.request({
    method: "DELETE",
    url: `https://secretmanager.googleapis.com/v1/projects/${cfg.gcpProjectId}/secrets/${secretId}`,
  });
}

async function provisionGceVm(cfg: OrgConfig, name: string, secretName: string) {
  const client = await getGcpAuthClient(cfg);
  const zone = cfg.gcpZone ?? "us-central1-a";
  const startupScript = [
    "#!/bin/bash",
    "set -e",
    `SECRET_VALUE=$(gcloud secrets versions access latest --secret=${secretName} --project=${cfg.gcpProjectId})`,
    "useradd -m -s /bin/bash fivetran || true",
    "apt-get update -qq && apt-get install -y -qq docker.io",
    "systemctl start docker && usermod -aG docker fivetran",
    'su - fivetran -c "curl -fsSL https://fivetran.com/install | bash -s -- $SECRET_VALUE"',
  ].join("\n");

  await client.request({
    method: "POST",
    url: `https://compute.googleapis.com/compute/v1/projects/${cfg.gcpProjectId}/zones/${zone}/instances`,
    data: {
      name,
      machineType: `zones/${zone}/machineTypes/e2-standard-8`,
      disks: [{
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: "projects/debian-cloud/global/images/family/debian-12",
          diskSizeGb: "50",
        },
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

async function deleteGceVm(cfg: OrgConfig, name: string) {
  const client = await getGcpAuthClient(cfg);
  const zone = cfg.gcpZone ?? "us-central1-a";
  await client.request({
    method: "DELETE",
    url: `https://compute.googleapis.com/compute/v1/projects/${cfg.gcpProjectId}/zones/${zone}/instances/${name}`,
  });
}

// ── Destination and connector creation ───────────────────────────────────────

async function createDestination(
  account: { apiKey: string; apiSecret: string },
  groupId: string,
  agentId: string,
  name: string,
  cfg: OrgConfig
) {
  let config: Record<string, unknown> = {};

  if (cfg.destination === "snowflake") {
    config = {
      host: cfg.snowflakeAccount,
      user: cfg.snowflakeUser,
      auth: "PAT",
      personal_access_token: cfg.snowflakePatToken,
      database: name.toUpperCase().replace(/-/g, "_"),
      warehouse: cfg.snowflakeWarehouse ?? "COMPUTE_WH",
    };
  } else if (cfg.destination === "databricks") {
    config = {
      server_hostname: cfg.databricksHost,
      http_path: `/sql/1.0/warehouses/${cfg.databricksWarehouseId}`,
      personal_access_token: cfg.databricksPatToken,
      catalog: "main",
    };
  }

  return fivetranPost(account, `/groups/${groupId}/destinations`, {
    service: cfg.destination,
    region: "GCP_US_CENTRAL1",
    hybrid_deployment_agent_id: agentId,
    config,
  });
}

