import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { step, config } = await req.json();

  if (step === "org") {
    if (!config.orgName?.trim()) return NextResponse.json({ ok: false, error: "Organization name is required" });
    return NextResponse.json({ ok: true });
  }

  if (step === "fivetran") {
    if (!config.fivetranApiKey || !config.fivetranApiSecret) {
      return NextResponse.json({ ok: false, error: "API key and secret are required" });
    }
    try {
      const res = await fetch("https://api.fivetran.com/v1/users?limit=1", {
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.fivetranApiKey}:${config.fivetranApiSecret}`).toString("base64")}`,
          Accept: "application/json;version=2",
        },
      });
      if (!res.ok) return NextResponse.json({ ok: false, error: `Fivetran API returned ${res.status} - check your API key and secret` });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Cannot reach Fivetran API: ${(e as Error).message}` });
    }
  }

  if (step === "cloud") {
    if (!config.gcpProjectId) return NextResponse.json({ ok: false, error: "GCP Project ID is required" });
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const authOptions = config.gcpKeyFilePath
        ? { keyFile: config.gcpKeyFilePath, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }
        : { scopes: ["https://www.googleapis.com/auth/cloud-platform"] };
      const auth = new GoogleAuth(authOptions);
      const client = await auth.getClient();
      const res = await client.request({ url: `https://compute.googleapis.com/compute/v1/projects/${config.gcpProjectId}` });
      if ((res.status as number) !== 200) return NextResponse.json({ ok: false, error: "Cannot access GCP project - check permissions" });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `GCP auth failed: ${(e as Error).message}. Run: gcloud auth application-default login`,
      });
    }
  }

  if (step === "destination") {
    if (config.destination === "snowflake") {
      if (!config.snowflakeAccount || !config.snowflakeUser || !config.snowflakePatToken) {
        return NextResponse.json({ ok: false, error: "Snowflake account, user, and PAT token are required" });
      }
    } else if (config.destination === "databricks") {
      if (!config.databricksHost || !config.databricksPatToken || !config.databricksWarehouseId) {
        return NextResponse.json({ ok: false, error: "Databricks host, token, and warehouse ID are required" });
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
