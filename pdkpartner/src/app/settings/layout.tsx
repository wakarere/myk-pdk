import { PartnerSidebar } from "@/components/PartnerSidebar";
import { db } from "@/lib/db";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cfg = await db.orgConfig.findUnique({ where: { id: "singleton" } });
  return (
    <div className="flex h-screen overflow-hidden">
      <PartnerSidebar orgName={cfg?.orgName} />
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  );
}
