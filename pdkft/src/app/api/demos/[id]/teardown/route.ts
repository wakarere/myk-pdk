import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teardownHdDemo } from "@/lib/hd/runner";
import { teardownMdlsDemo } from "@/lib/mdls/runner";
import { teardownOdiDemo } from "@/lib/odi/runner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const demo = await db.demo.findUnique({ where: { id: params.id } });
  if (!demo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.demo.update({ where: { id: params.id }, data: { status: "tearing_down" } });

  if (demo.blueprint === "mdls") {
    teardownMdlsDemo(params.id, { account: demo.account, platform: demo.platform, destination: demo.destination }).catch(console.error);
  } else if (demo.blueprint === "odi") {
    teardownOdiDemo(params.id, { account: demo.account, platform: demo.platform, destination: demo.destination }).catch(console.error);
  } else {
    teardownHdDemo(params.id).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
