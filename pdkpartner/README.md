# PDK Partner - Partner Demo Portal

A self-service demo launcher for Fivetran GSI/SI partners. You bring your own Fivetran account, GCP project, and destination (Snowflake or Databricks). The app runs locally on your Mac.

## What it does

Launches a Fivetran Hybrid Deployment agent on your GCP infrastructure in ~12 minutes:

1. Provisions a GCE VM in your GCP project
2. Installs the Fivetran HD agent on the VM
3. Connects the agent to your Fivetran account
4. Creates a destination (Snowflake or Databricks) routed through your agent

The result: a live HD agent running in your cloud, visible in the Fivetran dashboard, showing exactly how Fivetran's HD product works in a real partner environment.

## Prerequisites

- Node.js 20+
- `gcloud` CLI installed and authenticated (`gcloud auth application-default login`)
- A Fivetran account with a service account API key and secret
- A GCP project with billing enabled
- A Snowflake or Databricks account for the destination

### GCP APIs required

Enable these in your GCP project before running:

```bash
gcloud services enable compute.googleapis.com secretmanager.googleapis.com
```

## First-time setup

```bash
git clone https://github.com/wakarere/myk-pdk.git
cd myk-pdk/pdkpartner
npm install
npm run db:setup
npm run dev
```

Open http://localhost:3002 - you'll be taken to the setup wizard automatically.

The wizard collects and validates your credentials in 4 steps:
1. **Organization** - your org name (display only)
2. **Fivetran** - API key and secret (validated live against the Fivetran API)
3. **Cloud** - GCP project ID and zone (validated live against the Compute API)
4. **Destination** - Snowflake or Databricks credentials

Credentials are stored in a local SQLite database on your machine. Nothing is sent externally except to validate against Fivetran and GCP APIs during setup.

## Running after setup

```bash
npm run dev
```

Open http://localhost:3002. Click "New Demo" to launch an HD agent.

## Updating credentials

Go to **Settings** in the sidebar to update any credential without re-running the full wizard.

## Running tests

```bash
# First time: install Playwright browser
npx playwright install chromium

# Run all E2E tests (headless)
npm test

# Visual UI mode for debugging
npm run test:ui
```

## Resetting everything

```bash
npm run db:reset
npm run db:setup
```

Then open http://localhost:3002 - the setup wizard runs again.

## Troubleshooting

**GCP auth fails:** Run `gcloud auth application-default login` and try again. If using a service account key file, set the path in Settings.

**Fivetran API 401:** Check that your API key and secret are from a service account (not a personal key) in your Fivetran account settings.

**Agent never comes online:** Check that your GCP VM has internet egress. The HD agent needs to reach Fivetran's API. Check VM startup logs in GCP Console under Compute Engine.

**Teardown fails:** Resources can be manually deleted in GCP Console (look for VMs tagged `pdk-managed: true`) and in Fivetran dashboard (groups named `pdk-group-*`).
