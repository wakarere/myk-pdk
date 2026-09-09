"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

const BLUEPRINTS = [
  { id: "hd", label: "Hybrid Deployment", desc: "Docker ~12 min / GKE ~25 min", available: true },
  { id: "mdls", label: "MDLS Buildout", desc: "S3/GCS/ADLS - ~20 min", available: false },
  { id: "odi", label: "ODI Any-Agent", desc: "6 engines, 7 industries - ~30 min", available: false },
];

const ACCOUNTS = [
  { id: "MDS_SNOWFLAKE_HOL", label: "MDS_SNOWFLAKE_HOL", destination: "snowflake" },
  { id: "MDS_DATABRICKS_HOL", label: "MDS_DATABRICKS_HOL", destination: "databricks" },
  { id: "MDS_BIGQUERY_HOL", label: "MDS_BIGQUERY_HOL", destination: "big_query" },
];

const PLATFORMS = [
  { id: "docker", label: "Docker on GCE", detail: "~12 min", blueprints: ["hd"] },
  { id: "gke", label: "Kubernetes GKE", detail: "~25 min", blueprints: ["hd"] },
  { id: "cloud_run", label: "Cloud Run", detail: "~20 min", blueprints: ["mdls"] },
];

export function NewDemoDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [blueprint, setBlueprint] = useState("hd");
  const [account, setAccount] = useState("MDS_SNOWFLAKE_HOL");
  const [platform, setPlatform] = useState("docker");
  const [label, setLabel] = useState("");
  const [step, setStep] = useState<"config" | "preflight" | "launching">("config");
  const [preflightResult, setPreflightResult] = useState<{ passed: boolean; checks: { name: string; ok: boolean; message?: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = ACCOUNTS.find((a) => a.id === account)!;
  const availablePlatforms = PLATFORMS.filter((p) => p.blueprints.includes(blueprint));

  async function runPreflight() {
    setStep("preflight");
    setError(null);
    try {
      const res = await fetch("/api/demos/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint, account, platform }),
      });
      setPreflightResult(await res.json());
    } catch (e) {
      setError("Preflight request failed. Check server logs.");
      setStep("config");
    }
  }

  async function launch() {
    setStep("launching");
    setError(null);
    try {
      const res = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprint,
          account,
          platform,
          destination: selectedAccount.destination,
          label: label || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
      setStep("preflight");
    }
  }

  function reset() {
    setStep("config");
    setPreflightResult(null);
    setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={reset} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Demo</h2>
          <button onClick={reset} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">{error}</div>
          )}

          {step === "config" && (
            <>
              {/* Blueprint */}
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
                        onChange={() => {
                          setBlueprint(bp.id);
                          const firstPlatform = PLATFORMS.find((p) => p.blueprints.includes(bp.id));
                          if (firstPlatform) setPlatform(firstPlatform.id);
                        }}
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

              {/* Account */}
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                  Fivetran Account
                </label>
                <div className="space-y-1.5">
                  {ACCOUNTS.map((acc) => (
                    <label key={acc.id} className="flex items-center gap-3 p-2.5 rounded border border-gray-200 cursor-pointer hover:border-gray-300">
                      <input
                        type="radio"
                        name="account"
                        value={acc.id}
                        checked={account === acc.id}
                        onChange={() => setAccount(acc.id)}
                      />
                      <div>
                        <p className="text-sm text-gray-900">{acc.label}</p>
                        <p className="text-xs text-gray-400 capitalize">{acc.destination.replace("_", " ")}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Platform */}
              {availablePlatforms.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                    Platform
                  </label>
                  <div className="space-y-1.5">
                    {availablePlatforms.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 p-2.5 rounded border border-gray-200 cursor-pointer hover:border-gray-300">
                        <input
                          type="radio"
                          name="platform"
                          value={p.id}
                          checked={platform === p.id}
                          onChange={() => setPlatform(p.id)}
                        />
                        <div>
                          <p className="text-sm text-gray-900">{p.label}</p>
                          <p className="text-xs text-gray-400">{p.detail}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Label */}
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                  Partner / Event (optional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. phData Pilot, EY Workshop"
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
                  <div key={i} className={`flex items-start gap-2 p-2.5 rounded text-sm ${check.ok ? "bg-green-50" : "bg-red-50"}`}>
                    <span className={check.ok ? "text-green-600" : "text-red-600"}>{check.ok ? "PASS" : "FAIL"}</span>
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

          {step === "launching" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="text-brand animate-spin" />
              <p className="text-sm text-gray-500">Starting provisioning...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
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
        </div>
      </div>
    </>
  );
}
