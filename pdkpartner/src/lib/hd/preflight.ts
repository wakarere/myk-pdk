/**
 * Preflight checks for partner demos.
 * Blueprint-aware: HD checks Compute Engine + Secret Manager;
 * MDLS and ODI check Cloud Storage instead.
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

export async function runPreflight(blueprint: "hd" | "mdls" | "odi" = "hd"): Promise<PreflightResult> {
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
      name: `Fivetran API — ${cfg.fivetranAccount}`,
      ok: res.ok,
      message: res.ok ? undefined : `HTTP ${res.status}: check API key and secret in setup`,
    });
  } catch (e) {
    checks.push({ name: `Fivetran API — ${cfg.fivetranAccount}`, ok: false, message: (e as Error).message });
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
      checks.push({ name: `GCP project accessible (${cfg.gcpProjectId})`, ok: (res.status as number) === 200 });
    } catch (e) {
      checks.push({
        name: "GCP project accessible",
        ok: false,
        message: `GCP auth failed: ${(e as Error).message}. Run: gcloud auth application-default login`,
      });
    }
  }

  // ── Blueprint-specific GCP API checks ───────────────────────────────────────
  if (cfg.gcpProjectId) {
    const { GoogleAuth } = await import("google-auth-library");
    const authOptions = cfg.gcpKeyFilePath?.trim()
      ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
      : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };

    if (blueprint === "hd") {
      // HD needs Compute Engine (for VMs) and Secret Manager
      for (const [service, label, hint] of [
        ["compute.googleapis.com", "Compute Engine API enabled", "gcloud services enable compute.googleapis.com"],
        ["secretmanager.googleapis.com", "Secret Manager API enabled", "gcloud services enable secretmanager.googleapis.com"],
      ]) {
        try {
          const client = await new GoogleAuth(authOptions).getClient();
          const res = await client.request({
            url: `https://serviceusage.googleapis.com/v1/projects/${cfg.gcpProjectId}/services/${service}`,
          });
          const data = (res.data as { state?: string });
          checks.push({
            name: label,
            ok: data.state === "ENABLED",
            message: data.state !== "ENABLED" ? `Enable via: ${hint}` : undefined,
          });
        } catch (e) {
          checks.push({ name: label, ok: false, message: (e as Error).message });
        }
      }
    } else {
      // MDLS and ODI need Cloud Storage (for GCS lake)
      try {
        const client = await new GoogleAuth(authOptions).getClient();
        const res = await client.request({
          url: `https://serviceusage.googleapis.com/v1/projects/${cfg.gcpProjectId}/services/storage.googleapis.com`,
        });
        const data = (res.data as { state?: string });
        checks.push({
          name: "Cloud Storage API enabled",
          ok: data.state === "ENABLED",
          message: data.state !== "ENABLED" ? "Enable via: gcloud services enable storage.googleapis.com" : undefined,
        });
      } catch (e) {
        checks.push({ name: "Cloud Storage API enabled", ok: false, message: (e as Error).message });
      }
    }
  }

  // ── BigQuery API check (MDLS/ODI + big_query destination) ───────────────────
  if (blueprint !== "hd" && cfg.destination === "big_query" && cfg.gcpProjectId) {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authOptions = cfg.gcpKeyFilePath?.trim()
        ? { keyFile: cfg.gcpKeyFilePath.trim(), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
        : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
      const client = await new GoogleAuth(authOptions).getClient();
      const res = await client.request({
        url: `https://serviceusage.googleapis.com/v1/projects/${cfg.gcpProjectId}/services/bigquery.googleapis.com`,
      });
      const data = (res.data as { state?: string });
      checks.push({
        name: "BigQuery API enabled",
        ok: data.state === "ENABLED",
        message: data.state !== "ENABLED" ? "Enable via: gcloud services enable bigquery.googleapis.com" : undefined,
      });
    } catch (e) {
      checks.push({ name: "BigQuery API enabled", ok: false, message: (e as Error).message });
    }
  }

  // ── Destination credentials check ────────────────────────────────────────────
  if (cfg.destination === "snowflake") {
    const ok = !!(cfg.snowflakeAccount && cfg.snowflakeUser && cfg.snowflakePatToken);
    checks.push({
      name: "Snowflake credentials configured",
      ok,
      message: ok ? undefined : "Snowflake account, user, and RSA private key are required",
    });
  } else if (cfg.destination === "databricks") {
    const ok = !!(cfg.databricksHost && cfg.databricksPatToken && cfg.databricksWarehouseId);
    checks.push({
      name: "Databricks credentials configured",
      ok,
      message: ok ? undefined : "Databricks host, PAT token, and warehouse ID are required",
    });
  }

  // ── ODI: Databricks connectivity (optional engine, non-blocking) ─────────────
  if (blueprint === "odi" && cfg.databricksHost && cfg.databricksPatToken) {
    try {
      const base = cfg.databricksHost.startsWith("http") ? cfg.databricksHost : `https://${cfg.databricksHost}`;
      const res = await fetch(`${base}/api/2.0/clusters/list?limit=1`, {
        headers: { Authorization: `Bearer ${cfg.databricksPatToken}` },
      });
      checks.push({
        name: "Databricks API accessible",
        ok: res.ok,
        message: res.ok ? undefined : `HTTP ${res.status} — Databricks connectivity issue (Genie space will be skipped)`,
      });
    } catch (e) {
      checks.push({ name: "Databricks API accessible", ok: false, message: `${(e as Error).message} — Genie space will be skipped` });
    }
  }

  const passed = checks.every((c) => c.ok);
  return { passed, checks };
}
