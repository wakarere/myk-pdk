import { NextResponse } from "next/server";
import { runPreflight } from "@/lib/hd/preflight";

export async function POST() {
  const result = await runPreflight();
  return NextResponse.json(result);
}
