# Partner Demo Kit (PDK)

The Partner Demo Kit is a locally-run web application that lets Fivetran partner teams spin up fully working data pipeline demos in minutes, without any manual Fivetran UI clicks or infrastructure setup. A partner SE opens the app in their browser, picks a demo type, hits Launch, and the tool automatically provisions everything end-to-end: a Fivetran group, a cloud data lake on GCS, a PostgreSQL source connector, and the initial data sync — all while streaming live progress logs so the SE can narrate what's happening in real time. Once done, tearing everything down is a single button click, leaving no orphaned cloud resources behind.

---

# Technical Reference

## What it is

Two Next.js applications running on `localhost`:

| App | Port | Purpose |
|---|---|---|
| `pdkpartner` | 3002 | Partner-owned deployment — partner brings their own Fivetran account + GCP project |
| `pdkft` | 3001 | Fivetran-internal deployment — uses pre-configured Fivetran SE accounts |

Both share the same UI design and blueprint system. Data is stored in a local SQLite database via Prisma.

## Blueprints

### HD — Hybrid Deployment
Provisions a GCP Compute Engine VM running the Fivetran Hybrid Deployment agent, connects it to a Cloud SQL PostgreSQL source, syncs to the partner's destination (Snowflake, Databricks, or BigQuery), then tears down the VM on teardown. Demonstrates on-premises/VPC data extraction without opening inbound firewall rules.

### MDLS — Managed Data Lake Service
Creates a GCS bucket, provisions a Fivetran `managed_data_lake` destination pointed at it, connects a PostgreSQL source using `QUERY_BASED` replication, syncs agriculture sample data, and produces three open-format outputs from a single write: Delta Lake (transaction log), Apache Iceberg (catalog metadata), and Parquet (data files). Optionally attaches Snowflake via a Polaris catalog integration, Databricks Unity Catalog, or BigQuery Managed Storage (BQMS) as query engines over the same lake files.

### ODI — Open Data Integration
Extends MDLS with a Databricks Genie Space, enabling natural-language querying of the lake data alongside the three open-format engine demos.

## How a demo run works (MDLS example)

```
1. Preflight        — verify GCP access, Storage API enabled, Fivetran credentials
2. Group + Bucket   — create Fivetran group + GCS bucket (softDeletePolicy=0 for org constraints)
3. Destination      — POST /destinations (service=managed_data_lake, storage=GCS)
4. Wait connected   — poll until Fivetran mints its GCS service account
5. IAM grant        — grant storage.objectAdmin to the Fivetran SA on the bucket
6. Connector        — POST /connections (service=postgres, update_method=QUERY_BASED, paused=true)
7. Cert approval    — POST /connections/{id}/test → extract TLS cert from failing test detail
                      → POST /connections/{id}/certificates (encoded_cert + hash)
                      → re-run /test → all pass → setup_state=connected
8. Schema narrow    — PATCH schemas to agriculture.agr_records only (non-fatal)
9. Unpause + sync   — unpause, waitForSetupState, POST /connections/{id}/sync?force=true
10. Wait sync       — poll until succeeded_at set (up to 20 min)
11. Engine attach   — Snowflake CATALOG INTEGRATION, Databricks UC, or BQ BQMS (destination-dependent)
12. QA gate         — verify sync_complete, destination_connected, engine row count
```

## Known limitations

- **Polaris OAuth credentials**: Fivetran's `GET /destinations/{id}` does not return the Polaris OAuth client_id/secret in the response body, so the Snowflake catalog integration is skipped automatically. Check the Fivetran UI destination config for the credentials if needed.
- **GCP credentials expire**: Run `gcloud auth application-default login` and restart the dev server when you see `invalid_rapt` errors.
- **Cloud SQL TLS cert**: The shared SE demo DB uses a Google Cloud SQL server cert that Fivetran does not trust by default. The runner auto-approves it via `POST /connections/{id}/certificates` on first connect. The cert hash may change if Cloud SQL rotates it.
- **GCP zone**: Defaults to `us-central1-a` (set in Setup). The GCS bucket location and Fivetran region are derived from it automatically.

## Setup (pdkpartner)

```bash
# Prerequisites
node --version            # >= 20
gcloud auth application-default login

cd pdkpartner
npm install
npx prisma migrate deploy
npm run dev               # runs on localhost:3002
```

Open `http://localhost:3002` — the setup wizard will prompt for:
- Fivetran API key + secret
- GCP Project ID + zone (+ optional service account key path)
- Destination: Snowflake (RSA key pair auth), Databricks (PAT + warehouse ID), or BigQuery (dataset name)

## Smoke tests

```bash
node /tmp/mdls-smoke-test.mjs   # ~11 min end-to-end, exits 0 on demo_ready
node /tmp/odi-smoke-test.mjs    # ~15 min end-to-end
```

## Teardown

Every provisioned resource (Fivetran group, destination, connector, GCS bucket) is tracked in the `DemoResource` table. Teardown deletes them in reverse-creation order. Auto-teardown triggers on any fatal error during provisioning.
