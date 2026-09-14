# myk-pdk — Partner Demo Kit

Two self-contained demo portals for Fivetran partner enablement.

| Project | Purpose | Who runs it |
|---|---|---|
| `pdkft/` | Internal Fivetran demo launcher — uses pre-configured SE credentials | Fivetran SEs |
| `pdkpartner/` | Partner-owned demo launcher — partners bring their own accounts | GSI/SI partners |

Both run locally on a Mac. No cloud hosting required.

---

## Blueprints

Three demo blueprints are available in both portals:

| Blueprint | What it provisions | Time |
|---|---|---|
| **HD** — Hybrid Deployment | Docker agent on GCE, PostgreSQL connector, Snowflake/Databricks destination | ~12 min |
| **MDLS** — Managed Data Lake Service | GCS bucket (Delta + Iceberg + Parquet), Fivetran-managed Polaris catalog, Snowflake linked DB | ~20 min |
| **ODI** — Any-Agent | Full MDLS lake + Databricks UC attach + Genie Space + Snowflake catalog | ~30 min |

---

## Quick start

```bash
# Partner version (bring your own accounts)
cd pdkpartner
npm install
npm run db:setup
npm run dev
# Open http://localhost:3002 — follow the setup wizard
```

```bash
# Internal Fivetran version
cd pdkft
npm install
cp .env.example .env.local   # fill in credentials (see pdkft/README.md)
npm run db:setup
npm run dev
# Open http://localhost:3001
```

---

## Prerequisites

- Node.js 20+
- `gcloud` CLI installed and authenticated: `gcloud auth application-default login`
- A GCP project with billing enabled
- Fivetran account with API key + secret

### GCP APIs required

- **All blueprints:** Cloud Resource Manager, Service Usage
- **HD:** Compute Engine, Secret Manager
- **MDLS / ODI:** Cloud Storage

Enable in one command:
```bash
gcloud services enable compute.googleapis.com secretmanager.googleapis.com storage.googleapis.com
```

---

## pdkpartner — Partner Demo Launcher

### Setup

1. `cd pdkpartner && npm install && npm run db:setup && npm run dev`
2. Open `http://localhost:3002`
3. The setup wizard collects:
   - **Fivetran** API key, secret, account ID
   - **GCP** project ID (and optionally a service account key file path)
   - **Destination** credentials — Snowflake or Databricks

### Creating a demo

1. Click **New Demo**
2. Select a blueprint (HD / MDLS / ODI)
3. Add an optional label (customer name, event)
4. Click **Run Preflight** — validates all credentials and GCP API access
5. Click **Launch Demo** — live log stream appears in the drawer

### Recording demos (video)

To record a clean demo video:

1. Set up the screen with the drawer open
2. Run preflight → show green checks → click Launch
3. Let logs roll for ~30 seconds (bucket creation, group setup)
4. **Cut** — provisioning continues in the background
5. Resume recording at the "Demo ready" green checkmark

For co-working orchestration (trigger via API while you record the browser):
```bash
# Requires Claude Code (CLI) — not Claude Desktop chat
node /tmp/mdls-smoke-test.mjs   # creates + monitors an MDLS demo
node /tmp/odi-smoke-test.mjs    # creates + monitors an ODI demo
```

### Smoke tests

End-to-end tests against the live server (no mocks):

```bash
# Server must be running on localhost:3002
node /tmp/mdls-smoke-test.mjs   # ~20 min, exits 0 on demo_ready
node /tmp/odi-smoke-test.mjs    # ~35 min, exits 0 on demo_ready
```

### Teardown

Every demo has a Teardown button in the demo list. Resources cleaned up in reverse order:
- Fivetran connection → destination → group
- GCS bucket (all objects then bucket)
- Databricks UC catalog name (logged — drop manually if needed)
- Genie Space

---

## pdkft — Internal Fivetran Demo Launcher

Uses pre-configured SE credentials from `.env.local`. See `pdkft/README.md` for full setup.

Blueprints available: HD, MDLS (read-only validation of shared SE lake), ODI (validates pre-built 21-agent infrastructure).

---

## Architecture notes

- Both apps: Next.js 15 (App Router), SQLite via Prisma, Tailwind CSS
- Demos run asynchronously — the runner fires in the background, logs streamed via `/api/demos/:id/logs`
- Each demo tracks resources in SQLite for clean teardown
- GCS buckets: `softDeletePolicy.retentionDurationSeconds=0` required for GCP org policy compliance
- PostgreSQL connector: uses `update_method=XMIN` (no WAL/logical replication required on source)

---

## Known limitations

- Polaris client credentials are not yet surfaced in the Fivetran destination API response — Snowflake catalog integration requires manual credential entry post-provisioning
- Setup tests for the `postgres` connector type do not resolve via the API test endpoint; the runner unpause-and-sync approach works around this
- `gcloud auth application-default login` must be re-run after corporate SSO token expiry
