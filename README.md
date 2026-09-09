# myk-pdk - Partner Demo Kit

Two self-contained demo portals for Fivetran partner enablement.

| Project | Purpose | Who runs it |
|---|---|---|
| `pdkft/` | Internal Fivetran demo launcher - uses Kelly's credentials | Fivetran SEs |
| `pdkpartner/` | Partner-owned demo launcher - partners bring their own accounts | GSI/SI partners |

Both run locally on a Mac. No cloud hosting required.

## Quick start

```bash
# Internal Fivetran version
cd pdkft
npm install
cp .env.example .env.local   # fill in credentials (see pdkft/README.md)
npm run db:setup
npm run dev
# Open http://localhost:3001

# Partner version
cd pdkpartner
npm install
npm run db:setup
npm run dev
# Open http://localhost:3002 and follow the setup wizard
```

## Prerequisites

- Node.js 20+
- `gcloud` CLI authenticated (for pdkft: Fivetran GCP project access; for pdkpartner: partner GCP project access)
- Fivetran API key and secret
