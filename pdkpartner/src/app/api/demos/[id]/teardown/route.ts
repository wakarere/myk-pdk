import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teardownHdDemo } from "@/lib/hd/runner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const demo = await db.demo.findUnique({ where: { id: params.id } });
  if (!demo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.demo.update({ where: { id: params.id }, data: { status: "tearing_down" } });

  teardownHdDemo(params.id).catch(console.error);

  return NextResponse.json({ ok: true });
}
