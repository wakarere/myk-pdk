/**
 * Preflight checks for HD demos.
 * Each check returns { name, ok, message? }.
 * Ported from fivetran-hd-buildout preflight-hd-buildout tool.
 */

import { getAccountConfig, loadConfig } from "@/lib/config";

interface PreflightCheck {
  name: string;
  ok: boolean;
  message?: string;
}

interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
}

export async function runPreflight({
  blueprint,
  account,
  platform,
}: {
  blueprint: string;
  account: string;
  platform: string;
}): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // ── Config checks ───────────────────────────────────────────────────────────
  try {
    loadConfig();
    checks.push({ name: "Configuration loaded", ok: true });
  } catch (e) {
    checks.push({ name: "Configuration loaded", ok: false, message: (e as Error).message });
    return { passed: false, checks };
  }

  // ── Fivetran API check ──────────────────────────────────────────────────────
  try {
    const cfg = getAccountConfig(account);
    const res = await fetch("https://api.fivetran.com/v1/users?limit=1", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}`,
        Accept: "application/json;version=2",
      },
    });
    checks.push({
      name: `Fivetran API - ${account}`,
      ok: res.ok,
      message: res.ok ? undefined : `HTTP ${res.status}: check API key and secret`,
    });
  } catch (e) {
    checks.push({ name: `Fivetran API - ${account}`, ok: false, message: (e as Error).message });
  }

  // ── GCP project check ───────────────────────────────────────────────────────
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const cfg = loadConfig();
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

  // ── GCP Compute Engine API ──────────────────────────────────────────────────
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const cfg = loadConfig();
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

  // ── Secret Manager API ──────────────────────────────────────────────────────
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const cfg = loadConfig();
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

  // ── Source database reachability ────────────────────────────────────────────
  try {
    const cfg = loadConfig();
    const { Client } = await import("pg");
    const client = new Client({
      host: cfg.hdSource.host,
      port: cfg.hdSource.port,
      database: cfg.hdSource.database,
      user: cfg.hdSource.user,
      password: cfg.hdSource.password,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    const res = await client.query(`SELECT COUNT(*) FROM ${cfg.hdSource.schema}.${cfg.hdSource.table} LIMIT 1`);
    await client.end();
    checks.push({ name: `Source PostgreSQL reachable (${cfg.hdSource.host})`, ok: true });
  } catch (e) {
    checks.push({
      name: "Source PostgreSQL reachable",
      ok: false,
      message: (e as Error).message,
    });
  }

  const passed = checks.every((c) => c.ok);
  return { passed, checks };
}
