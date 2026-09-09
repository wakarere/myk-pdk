import { Sidebar } from "@/components/Sidebar";
export default function AnalyticsPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-6 bg-gray-50">
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-2">Demo run history and metrics - coming soon.</p>
      </main>
    </div>
  );
}
