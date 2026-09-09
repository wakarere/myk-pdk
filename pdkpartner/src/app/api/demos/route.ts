import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runHdDemo } from "@/lib/hd/runner";
import { z } from "zod";

const CreateDemoSchema = z.object({
  blueprint: z.enum(["hd", "mdls", "odi"]),
  platform: z.string().min(1),
  label: z.string().optional(),
});

export async function GET() {
  const demos = await db.demo.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(demos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateDemoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { blueprint, platform, label } = parsed.data;

  // Read destination from stored org config
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) return NextResponse.json({ error: "Setup not complete" }, { status: 400 });

  const demo = await db.demo.create({
    data: {
      blueprint,
      account: cfg.fivetranAccount,
      platform,
      destination: cfg.destination,
      label,
      status: "pending",
    },
  });

  if (blueprint === "hd") {
    runHdDemo(demo.id).catch(console.error);
  }

  return NextResponse.json(demo, { status: 201 });
}
