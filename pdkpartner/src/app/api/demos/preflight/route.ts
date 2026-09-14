import { NextRequest, NextResponse } from "next/server";
import { runPreflight } from "@/lib/hd/preflight";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const blueprint = (body.blueprint as "hd" | "mdls" | "odi") ?? "hd";
  const result = await runPreflight(blueprint);
  return NextResponse.json(result);
}
