import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const logs = await db.demoLog.findMany({
    where: { demoId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(logs);
}
