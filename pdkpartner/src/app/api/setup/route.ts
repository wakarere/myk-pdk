import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
  orgName: z.string().min(1),
  fivetranApiKey: z.string().min(1),
  fivetranApiSecret: z.string().min(1),
  fivetranAccount: z.string().min(1),
  cloudProvider: z.string().min(1),
  gcpProjectId: z.string().optional(),
  gcpZone: z.string().optional(),
  gcpKeyFilePath: z.string().optional(),
  destination: z.string().min(1),
  snowflakeAccount: z.string().optional(),
  snowflakeUser: z.string().optional(),
  snowflakePatToken: z.string().optional(),
  snowflakeWarehouse: z.string().optional(),
  databricksHost: z.string().optional(),
  databricksPatToken: z.string().optional(),
  databricksWarehouseId: z.string().optional(),
});


export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid config" }, { status: 400 });

  const d = parsed.data;

  // Store config in SQLite. Credentials stored locally - never sent externally.
  // Note: for production use, encrypt sensitive fields.
  const record = {
    orgName: d.orgName,
    cloudProvider: d.cloudProvider,
    gcpProjectId: d.gcpProjectId,
    gcpZone: d.gcpZone ?? "us-central1-a",
    gcpKeyFilePath: d.gcpKeyFilePath,
    fivetranAccount: d.fivetranAccount,
    fivetranApiKey: d.fivetranApiKey,
    fivetranApiSecret: d.fivetranApiSecret,
    destination: d.destination,
    snowflakeAccount: d.snowflakeAccount,
    snowflakeUser: d.snowflakeUser,
    snowflakePatToken: d.snowflakePatToken,
    snowflakeWarehouse: d.snowflakeWarehouse,
    databricksHost: d.databricksHost,
    databricksPatToken: d.databricksPatToken,
    databricksWarehouseId: d.databricksWarehouseId,
    setupComplete: true,
  };

  await db.orgConfig.upsert({
    where: { id: "singleton" },
    create: record,
    update: record,
  });

  return NextResponse.json({ ok: true });
}
