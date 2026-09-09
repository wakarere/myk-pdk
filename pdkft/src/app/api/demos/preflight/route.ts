import { NextRequest, NextResponse } from "next/server";
import { runPreflight } from "@/lib/hd/preflight";
import { z } from "zod";

const Schema = z.object({
  blueprint: z.enum(["hd", "mdls", "odi"]),
  account: z.string(),
  platform: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await runPreflight(parsed.data);
  return NextResponse.json(result);
}
