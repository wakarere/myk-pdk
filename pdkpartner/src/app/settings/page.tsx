import { db } from "@/lib/db";
import { SettingsView } from "@/components/SettingsView";

export default async function SettingsPage() {
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  return <SettingsView current={cfg} />;
}
