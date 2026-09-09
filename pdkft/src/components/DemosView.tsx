"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { NewDemoDrawer } from "./NewDemoDrawer";
import type { Demo } from "@prisma/client";

const TABS = ["All", "Active", "Setup", "Done"] as const;
type Tab = (typeof TABS)[number];

const BLUEPRINT_LABELS: Record<string, string> = {
  hd: "Hybrid Deployment",
  mdls: "MDLS Buildout",
  odi: "ODI Any-Agent",
};

const DESTINATION_LABELS: Record<string, string> = {
  snowflake: "Snowflake",
  databricks: "Databricks",
  big_query: "BigQuery",
};

function filterDemos(demos: Demo[], tab: Tab): Demo[] {
  if (tab === "All") return demos;
  if (tab === "Active") return demos.filter((d) => ["provisioning", "qa_running", "demo_ready"].includes(d.status));
  if (tab === "Setup") return demos.filter((d) => ["pending", "preflight_running"].includes(d.status));
  if (tab === "Done") return demos.filter((d) => ["done", "failed", "preflight_failed", "qa_failed"].includes(d.status));
  return demos;
}

function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DemosView() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [tab, setTab] = useState<Tab>("All");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDemos = useCallback(async () => {
    const res = await fetch("/api/demos");
    if (res.ok) setDemos(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDemos();
    const interval = setInterval(fetchDemos, 5000);
    return () => clearInterval(interval);
  }, [fetchDemos]);

  const filtered = filterDemos(demos, tab);
  const activeCount = demos.filter((d) => ["provisioning", "qa_running", "demo_ready"].includes(d.status)).length;

  async function handleTeardown(id: string) {
    if (!confirm("Tear down this demo? This removes all cloud resources.")) return;
    await fetch(`/api/demos/${id}/teardown`, { method: "POST" });
    fetchDemos();
  }

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Demos</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDemos}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              New Demo
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 mb-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-brand text-brand font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
              {t === "Active" && activeCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-b-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400 text-sm">No demos yet.</p>
              <button
                onClick={() => setDrawerOpen(true)}
                className="mt-3 text-sm text-brand hover:underline"
              >
                Launch your first demo
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-6">
                    <input type="checkbox" className="rounded" readOnly />
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Blueprint</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Account</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Started</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((demo) => (
                  <tr
                    key={demo.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selected === demo.id ? "bg-brand-light" : ""
                    }`}
                    onClick={() => setSelected(selected === demo.id ? null : demo.id)}
                  >
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" readOnly />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{BLUEPRINT_LABELS[demo.blueprint] ?? demo.blueprint}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {DESTINATION_LABELS[demo.destination] ?? demo.destination} - {demo.platform}
                      </p>
                      {demo.label && (
                        <p className="text-xs text-gray-400">{demo.label}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{demo.account}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={demo.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtTime(demo.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {["demo_ready", "provisioning", "qa_running", "qa_failed"].includes(demo.status) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTeardown(demo.id); }}
                            className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                          >
                            Teardown
                          </button>
                        )}
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail / progress panel */}
      {selected && (
        <DemoDetailPanel demoId={selected} onClose={() => setSelected(null)} />
      )}

      {/* New demo drawer */}
      <NewDemoDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={() => { setDrawerOpen(false); fetchDemos(); }}
      />
    </div>
  );
}

function DemoDetailPanel({ demoId, onClose }: { demoId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<{ stage: string; message: string; level: string; createdAt: string }[]>([]);
  const [demo, setDemo] = useState<Demo | null>(null);

  useEffect(() => {
    async function load() {
      const [demoRes, logsRes] = await Promise.all([
        fetch(`/api/demos/${demoId}`),
        fetch(`/api/demos/${demoId}/logs`),
      ]);
      if (demoRes.ok) setDemo(await demoRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
    }
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [demoId]);

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-900">Run log</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>
      {demo && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <StatusBadge status={demo.status} />
          <p className="text-xs text-gray-400 mt-1">Run: {demo.runId.slice(0, 12)}...</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin">
        {logs.length === 0 ? (
          <p className="text-xs text-gray-400">Waiting for logs...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="text-xs">
              <span className={`font-medium ${log.level === "error" ? "text-red-600" : log.level === "warn" ? "text-amber-600" : "text-gray-500"}`}>
                {log.stage}
              </span>
              <p className="text-gray-700 mt-0.5">{log.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
