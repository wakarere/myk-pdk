# pdkft - Fivetran Internal Demo Launcher

Runs locally on your Mac. Uses Kelly's Fivetran accounts and credentials.
UI design matches LabStudios.

## Setup (5 min)

### 1. Prerequisites

```bash
node --version   # must be >= 20
gcloud auth application-default login   # authenticates to Fivetran GCP project
```

### 2. Install and configure

```bash
cd pdkft
npm install

# Copy and fill in credentials from 1Password ("Fivetran HD Buildout" vault)
cp .env.example .env.local
# Edit .env.local - see comments in the file
```

### 3. Initialize the database

```bash
npm run db:setup
```

### 4. Run

```bash
npm run dev
# Open http://localhost:3001
```

## Running a demo

1. Click **New Demo**
2. Select blueprint (Hybrid Deployment, MDLS)
3. Select Fivetran account (Snowflake / Databricks / BigQuery)
4. Select platform (Docker ~12 min / GKE ~25 min)
5. Click **Run Preflight** - verify all checks pass
6. Click **Launch Demo** - watch progress in the log panel
7. When status shows **Demo Ready**, run your demo
8. Click **Teardown** to remove all cloud resources

## Blueprints

| Blueprint | Status | Notes |
|---|---|---|
| Hybrid Deployment | Available | GCE Docker and GKE paths |
| MDLS Buildout | Planned | Phase 2 |
| ODI Any-Agent | Planned | Phase 3 |

## Credentials

All credentials come from `.env.local`. See `.env.example` for the full list.
For Kelly's values, check 1Password: `Fivetran HD Buildout - MCP API Key`.

Never commit `.env.local`.
