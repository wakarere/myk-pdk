/**
 * Preflight checks for partner HD demos.
 * Reads credentials from OrgConfig (SQLite) instead of env vars.
 */

import { db } from "@/lib/db";

interface PreflightCheck {
  name: string;
  ok: boolean;
  message?: string;
}

interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
}

export async function runPreflight(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // ── Load org config ──────────────────────────────────────────────────────────
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg || !cfg.setupComplete) {
    return {
      passed: false,
      checks: [{ name: "Configuration loaded", ok: false, message: "Setup not complete - run the setup wizard first" }],
    };
  }
  checks.push({ name: "Configuration loaded", ok: true });

  // ── Fivetran API check ───────────────────────────────────────────────────────
  try {
    const res = await fetch("https://api.fivetran.com/v1/users?limit=1", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.fivetranApiKey}:${cfg.fivetranApiSecret}`).toString("base64")}`,
        Accept: "application/json;version=2",
      },
    });
    checks.push({
      name: `Fivetran API - ${cfg.fivetranAccount}`,
      ok: res.ok,
      message: res.ok ? undefined : `HTTP ${res.status}: check API key and secret in setup`,
    });
  } catch (e) {
    checks.push({ name: `Fivetran API - ${cfg.fivetranAccount}`, ok: false, message: (e as Error).message });
  }

  // ── GCP project check ────────────────────────────────────────────────────────
  if (!cfg.gcpProjectId) {
    checks.push({ name: "GCP project accessible", ok: false, message: "GCP Project ID not configured" });
  } else {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authOptions = cfg.gcpKeyFilePath?.trim()
        ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
        : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
      const client = await new GoogleAuth(authOptions).getClient();
      const res = await client.request({
        url: `https://compute.googleapis.com/compute/v1/projects/${cfg.gcpProjectId}`,
      });
      checks.push({
        name: `GCP project accessible (${cfg.gcpProjectId})`,
        ok: (res.status as number) === 200,
      });
    } catch (e) {
      checks.push({
        name: "GCP project accessible",
        ok: false,
        message: `GCP auth failed: ${(e as Error).message}. Run: gcloud auth application-default login`,
      });
    }
  }

  // ── GCP Compute Engine API ───────────────────────────────────────────────────
  if (cfg.gcpProjectId) {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authOptions = cfg.gcpKeyFilePath?.trim()
        ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
        : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
      const client = await new GoogleAuth(authOptions).getClient();
      const res = await client.request({
        url: `https://serviceusage.googleapis.com/v1/projects/${cfg.gcpProjectId}/services/compute.googleapis.com`,
      });
      const data = (res.data as { state?: string });
      checks.push({
        name: "Compute Engine API enabled",
        ok: data.state === "ENABLED",
        message: data.state !== "ENABLED" ? "Enable via: gcloud services enable compute.googleapis.com" : undefined,
      });
    } catch (e) {
      checks.push({ name: "Compute Engine API enabled", ok: false, message: (e as Error).message });
    }
  }

  // ── Secret Manager API ───────────────────────────────────────────────────────
  if (cfg.gcpProjectId) {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authOptions = cfg.gcpKeyFilePath?.trim()
        ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
        : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
      const client = await new GoogleAuth(authOptions).getClient();
      const res = await client.request({
        url: `https://serviceusage.googleapis.com/v1/projects/${cfg.gcpProjectId}/services/secretmanager.googleapis.com`,
      });
      const data = (res.data as { state?: string });
      checks.push({
        name: "Secret Manager API enabled",
        ok: data.state === "ENABLED",
        message: data.state !== "ENABLED" ? "Enable via: gcloud services enable secretmanager.googleapis.com" : undefined,
      });
    } catch (e) {
      checks.push({ name: "Secret Manager API enabled", ok: false, message: (e as Error).message });
    }
  }

  // ── Destination credentials check ────────────────────────────────────────────
  if (cfg.destination === "snowflake") {
    const ok = !!(cfg.snowflakeAccount && cfg.snowflakeUser && cfg.snowflakePatToken);
    checks.push({
      name: "Snowflake credentials configured",
      ok,
      message: ok ? undefined : "Snowflake account, user, and PAT token are required",
    });
  } else if (cfg.destination === "databricks") {
    const ok = !!(cfg.databricksHost && cfg.databricksPatToken && cfg.databricksWarehouseId);
    checks.push({
      name: "Databricks credentials configured",
      ok,
      message: ok ? undefined : "Databricks host, token, and warehouse ID are required",
    });
  }

  const passed = checks.every((c) => c.ok);
  return { passed, checks };
}
