import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logs = await db.demoLog.findMany({
    where: { demoId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(logs);
}
