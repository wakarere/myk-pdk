import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PartnerDemosView } from "@/components/PartnerDemosView";

export default async function DemosPage() {
  const config = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.setupComplete) redirect("/setup");
  return <PartnerDemosView orgName={config.orgName} destination={config.destination} />;
}
