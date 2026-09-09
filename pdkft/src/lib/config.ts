/**
 * Load credentials from environment variables.
 * All values come from .env.local - never committed.
 */

export interface AccountConfig {
  label: string;
  apiKey: string;
  apiSecret: string;
}

export interface SnowflakeConfig {
  account: string;
  user: string;
  patToken: string;
  warehouse: string;
}

export interface DatabricksConfig {
  host: string;
  patToken: string;
  warehouseId: string;
  catalog?: string;
}

export interface HdSourceConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema: string;
  table: string;
}

export interface AppConfig {
  accounts: AccountConfig[];
  gcpProjectId: string;
  gcpZone: string;
  hdSource: HdSourceConfig;
  snowflake?: SnowflakeConfig;
  databricks?: DatabricksConfig;
  demoTtlHours: number;
}

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const accounts: AccountConfig[] = [];
  for (let i = 1; i <= 10; i++) {
    const label = process.env[`FIVETRAN_ACCOUNT_${i}_LABEL`];
    const apiKey = process.env[`FIVETRAN_ACCOUNT_${i}_API_KEY`];
    const apiSecret = process.env[`FIVETRAN_ACCOUNT_${i}_API_SECRET`];
    if (label && apiKey && apiSecret) accounts.push({ label, apiKey, apiSecret });
    else break;
  }

  if (accounts.length === 0) {
    throw new Error("No Fivetran accounts configured. Set FIVETRAN_ACCOUNT_1_LABEL, _API_KEY, _API_SECRET in .env.local");
  }

  _config = {
    accounts,
    gcpProjectId: requireEnv("GCP_PROJECT_ID"),
    gcpZone: process.env.GCP_ZONE ?? "us-central1-a",
    hdSource: {
      host: requireEnv("HD_SOURCE_HOST"),
      port: parseInt(process.env.HD_SOURCE_PORT ?? "5432"),
      database: requireEnv("HD_SOURCE_DATABASE"),
      user: requireEnv("HD_SOURCE_USER"),
      password: requireEnv("HD_SOURCE_PASSWORD"),
      schema: process.env.HD_SOURCE_SCHEMA ?? "public",
      table: requireEnv("HD_SOURCE_TABLE"),
    },
    snowflake: process.env.SNOWFLAKE_ACCOUNT
      ? {
          account: process.env.SNOWFLAKE_ACCOUNT!,
          user: requireEnv("SNOWFLAKE_USER"),
          patToken: requireEnv("SNOWFLAKE_PAT_TOKEN"),
          warehouse: requireEnv("SNOWFLAKE_WAREHOUSE"),
        }
      : undefined,
    databricks: process.env.DATABRICKS_HOST
      ? {
          host: process.env.DATABRICKS_HOST!,
          patToken: requireEnv("DATABRICKS_PAT_TOKEN"),
          warehouseId: requireEnv("DATABRICKS_WAREHOUSE_ID"),
          catalog: process.env.DATABRICKS_CATALOG,
        }
      : undefined,
    demoTtlHours: parseInt(process.env.DEMO_TTL_HOURS ?? "4"),
  };

  return _config;
}

export function getAccountConfig(label: string): AccountConfig {
  const cfg = loadConfig();
  const account = cfg.accounts.find((a) => a.label === label);
  if (!account) throw new Error(`Account '${label}' not found in config`);
  return account;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required environment variable ${key} is not set in .env.local`);
  return val;
}
