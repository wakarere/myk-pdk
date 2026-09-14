import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runHdDemo } from "@/lib/hd/runner";
import { runMdlsDemo } from "@/lib/mdls/runner";
import { runOdiDemo } from "@/lib/odi/runner";
import { z } from "zod";

const CreateDemoSchema = z.object({
  blueprint: z.enum(["hd", "mdls", "odi"]),
  account: z.string().min(1),
  platform: z.string().min(1),
  destination: z.string().min(1),
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

  const { blueprint, account, platform, destination, label } = parsed.data;

  const demo = await db.demo.create({
    data: { blueprint, account, platform, destination, label, status: "pending" },
  });

  // Run provisioning async (fire and forget - status updates via polling)
  if (blueprint === "hd") {
    runHdDemo(demo.id, { account, platform, destination }).catch(console.error);
  } else if (blueprint === "mdls") {
    runMdlsDemo(demo.id, { account, platform, destination }).catch(console.error);
  } else if (blueprint === "odi") {
    runOdiDemo(demo.id, { account, platform, destination }).catch(console.error);
  }

  return NextResponse.json(demo, { status: 201 });
}
