"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";

const BLUEPRINTS = [
  { id: "hd", label: "Hybrid Deployment", desc: "Docker on GCE - ~12 min", available: true },
  { id: "mdls", label: "MDLS Buildout", desc: "Multi-destination lake - ~20 min", available: false },
  { id: "odi", label: "ODI Any-Agent", desc: "6 engines, 7 industries - ~30 min", available: false },
];

interface LogEntry {
  stage: string;
  message: string;
  level: "info" | "warn" | "error";
  createdAt: string;
}

export function PartnerNewDemoDrawer({
  open,
  destination,
  onClose,
  onCreated,
}: {
  open: boolean;
  destination: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [blueprint, setBlueprint] = useState("hd");
  const [label, setLabel] = useState("");
  const [step, setStep] = useState<"config" | "preflight" | "running">("config");
  const [preflightResult, setPreflightResult] = useState<{
    passed: boolean;
    checks: { name: string; ok: boolean; message?: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoId, setDemoId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [demoStatus, setDemoStatus] = useState<string>("pending");
  const logBottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll logs when running
  useEffect(() => {
    if (step !== "running" || !demoId) return;

    async function poll() {
      const [logsRes, demoRes] = await Promise.all([
        fetch(`/api/demos/${demoId}/logs`),
        fetch(`/api/demos/${demoId}`),
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (demoRes.ok) {
        const demo = await demoRes.json();
        setDemoStatus(demo.status);
        if (demo.status === "demo_ready" || demo.status === "failed") {
          clearInterval(pollRef.current!);
          onCreated();
        }
      }
    }

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current!);
  }, [step, demoId]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function runPreflight() {
    setStep("preflight");
    setError(null);
    try {
      const res = await fetch("/api/demos/preflight", { method: "POST" });
      setPreflightResult(await res.json());
    } catch {
      setError("Preflight request failed. Check server logs.");
      setStep("config");
    }
  }

  async function launch() {
    setError(null);
    try {
      const res = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint, platform: "docker", label: label || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const demo = await res.json();
      setDemoId(demo.id);
      setDemoStatus(demo.status);
      setLogs([]);
      setStep("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
    }
  }

  function reset() {
    clearInterval(pollRef.current!);
    setStep("config");
    setPreflightResult(null);
    setError(null);
    setLabel("");
    setDemoId(null);
    setLogs([]);
    setDemoStatus("pending");
    onClose();
  }

  if (!open) return null;

  const destLabel = destination === "snowflake" ? "Snowflake" : destination === "databricks" ? "Databricks" : destination;
  const isDone = demoStatus === "demo_ready" || demoStatus === "failed";

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={step !== "running" ? reset : undefined} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Demo</h2>
          {(step !== "running" || isDone) && (
            <button onClick={reset} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 min-h-0">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">{error}</div>
          )}

          {step === "config" && (
            <>
              <div className="p-3 bg-brand-light rounded border border-brand/20">
                <p className="text-xs text-brand font-medium">Destination: {destLabel}</p>
                <p className="text-xs text-gray-500 mt-0.5">Configured in setup - uses your account credentials</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                  Blueprint
                </label>
                <div className="space-y-2">
                  {BLUEPRINTS.map((bp) => (
                    <label
                      key={bp.id}
                      className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                        bp.available
                          ? blueprint === bp.id
                            ? "border-brand bg-brand-light"
                            : "border-gray-200 hover:border-gray-300"
                          : "border-gray-100 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <input
                        type="radio"
                        name="blueprint"
                        value={bp.id}
                        checked={blueprint === bp.id}
                        disabled={!bp.available}
                        onChange={() => setBlueprint(bp.id)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{bp.label}</p>
                        <p className="text-xs text-gray-500">{bp.desc}</p>
                        {!bp.available && <p className="text-xs text-gray-400 italic">Coming soon</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                  Event / Customer Label (optional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. phData Pilot, Q3 Workshop"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-brand"
                />
              </div>
            </>
          )}

          {step === "preflight" && preflightResult && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Preflight Results</h3>
              <div className="space-y-2">
                {preflightResult.checks.map((check, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2.5 rounded text-sm ${check.ok ? "bg-green-50" : "bg-red-50"}`}
                  >
                    <span className={`font-medium flex-shrink-0 ${check.ok ? "text-green-600" : "text-red-600"}`}>
                      {check.ok ? "PASS" : "FAIL"}
                    </span>
                    <div>
                      <p className={check.ok ? "text-green-900" : "text-red-900"}>{check.name}</p>
                      {check.message && <p className="text-xs text-gray-500 mt-0.5">{check.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {!preflightResult.passed && (
                <p className="mt-3 text-xs text-red-600">Fix the failures above before launching.</p>
              )}
            </div>
          )}

          {step === "running" && (
            <div className="flex flex-col h-full">
              {/* Status bar */}
              <div className="flex items-center gap-2 mb-3">
                {isDone ? (
                  demoStatus === "demo_ready" ? (
                    <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-red-500 flex-shrink-0" />
                  )
                ) : (
                  <Loader2 size={16} className="text-brand animate-spin flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {demoStatus === "demo_ready"
                    ? "Demo ready"
                    : demoStatus === "failed"
                    ? "Provisioning failed"
                    : "Provisioning in progress…"}
                </span>
              </div>

              {/* Log window */}
              <div className="flex-1 bg-gray-950 rounded-lg p-4 overflow-y-auto font-mono text-xs leading-relaxed min-h-[400px]">
                {logs.length === 0 ? (
                  <p className="text-gray-500">Waiting for logs…</p>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className="mb-1">
                      <span className={`font-semibold mr-2 ${
                        entry.level === "error" ? "text-red-400" :
                        entry.level === "warn" ? "text-yellow-400" :
                        "text-blue-400"
                      }`}>
                        [{entry.stage}]
                      </span>
                      <span className={
                        entry.level === "error" ? "text-red-300" :
                        entry.level === "warn" ? "text-yellow-300" :
                        "text-gray-200"
                      }>
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logBottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          {step === "running" ? (
            isDone ? (
              <button
                onClick={reset}
                className="px-4 py-2 bg-brand text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            ) : (
              <p className="text-xs text-gray-400">Do not close — provisioning is running</p>
            )
          ) : (
            <>
              <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              {step === "config" && (
                <button
                  onClick={runPreflight}
                  className="px-4 py-2 bg-brand text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  Run Preflight
                </button>
              )}
              {step === "preflight" && preflightResult && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep("config")}
                    className="px-3 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={launch}
                    disabled={!preflightResult.passed}
                    className="px-4 py-2 bg-brand text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Launch Demo
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
