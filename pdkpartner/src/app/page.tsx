import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function Home() {
  const config = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.setupComplete) redirect("/setup");
  redirect("/demos");
}
