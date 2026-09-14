"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

type Step = "org" | "fivetran" | "cloud" | "destination" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "org", label: "Organization" },
  { id: "fivetran", label: "Fivetran" },
  { id: "cloud", label: "Cloud" },
  { id: "destination", label: "Destination" },
];

interface Config {
  orgName: string;
  fivetranApiKey: string;
  fivetranApiSecret: string;
  fivetranAccount: string;
  cloudProvider: string;
  gcpProjectId: string;
  gcpZone: string;
  gcpKeyFilePath: string;
  provisionDemoDb: boolean;
  destination: string;
  snowflakeAccount: string;
  snowflakeUser: string;
  snowflakePatToken: string;
  snowflakeWarehouse: string;
  databricksHost: string;
  databricksPatToken: string;
  databricksWarehouseId: string;
  bigqueryDataset: string;
}

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("org");
  const [config, setConfig] = useState<Partial<Config>>({ cloudProvider: "gcp", destination: "snowflake", provisionDemoDb: false });
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof Config, value: string | boolean) {
    setConfig((c) => ({ ...c, [key]: value }));
    setError(null);
  }

  async function validateAndNext() {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, config }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return; }
      const steps: Step[] = ["org", "fivetran", "cloud", "destination", "done"];
      const idx = steps.indexOf(step);
      if (idx < steps.length - 2) setStep(steps[idx + 1]);
      else await saveAndFinish();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  }

  async function saveAndFinish() {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) { setStep("done"); setTimeout(() => router.push("/demos"), 1500); }
    else setError(await res.text());
  }

  const currentIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Progress */}
      <div className="flex border-b border-gray-100">
        {STEPS.map((s, i) => (
          <div key={s.id} className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${i <= currentIdx ? "text-brand border-b-2 border-brand" : "text-gray-400"}`}>
            {i < currentIdx ? <CheckCircle size={12} className="inline mr-1 text-green-500" /> : null}
            {s.label}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {step === "org" && (
          <>
            <h2 className="text-base font-medium text-gray-900">Organization</h2>
            <Field label="Partner organization name" placeholder="e.g. phData, Accenture" value={config.orgName ?? ""} onChange={(v) => set("orgName", v)} />
          </>
        )}

        {step === "fivetran" && (
          <>
            <h2 className="text-base font-medium text-gray-900">Fivetran Account</h2>
            <p className="text-xs text-gray-500">Use a service account API key from your Fivetran account settings.</p>
            <Field label="API Key" placeholder="fi_..." value={config.fivetranApiKey ?? ""} onChange={(v) => set("fivetranApiKey", v)} />
            <Field label="API Secret" type="password" value={config.fivetranApiSecret ?? ""} onChange={(v) => set("fivetranApiSecret", v)} />
            <Field label="Account label (for display)" placeholder="e.g. phdata-prod" value={config.fivetranAccount ?? ""} onChange={(v) => set("fivetranAccount", v)} />
          </>
        )}

        {step === "cloud" && (
          <>
            <h2 className="text-base font-medium text-gray-900">Cloud Environment</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Cloud Provider</label>
              <div className="flex gap-2">
                {[["gcp", "GCP"], ["aws", "AWS (soon)"], ["azure", "Azure (soon)"]].map(([id, label]) => (
                  <button key={id} disabled={id !== "gcp"}
                    onClick={() => set("cloudProvider", id)}
                    className={`px-3 py-1.5 text-sm rounded border transition-colors ${config.cloudProvider === id ? "border-brand bg-brand-light text-brand" : "border-gray-200 text-gray-500"} disabled:opacity-40`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="GCP Project ID" placeholder="your-project-id" value={config.gcpProjectId ?? ""} onChange={(v) => set("gcpProjectId", v)} />
            <Field label="GCP Zone" placeholder="us-central1-a" value={config.gcpZone ?? "us-central1-a"} onChange={(v) => set("gcpZone", v)} />
            <Field label="Service Account Key file path" placeholder="/Users/you/keys/sa-key.json" value={config.gcpKeyFilePath ?? ""} onChange={(v) => set("gcpKeyFilePath", v)} />
            <p className="text-xs text-gray-400">Or leave blank to use Application Default Credentials (gcloud auth application-default login).</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={config.provisionDemoDb ?? false}
                onChange={(e) => set("provisionDemoDb", e.target.checked)}
                className="rounded border-gray-300"
              />
              Provision demo PostgreSQL database (creates a Cloud SQL instance with 7 industry schemas)
            </label>
            {config.provisionDemoDb && (
              <p className="text-xs text-gray-400 pl-6">
                A <code>db-g1-small</code> Cloud SQL Postgres 15 instance named <code>pdk-demo-db</code> will be created in your GCP project during each demo run. Agriculture, pharma, retail, financial services, healthcare, higher education, and supply chain schemas are seeded with ~750 rows each.
              </p>
            )}
          </>
        )}

        {step === "destination" && (
          <>
            <h2 className="text-base font-medium text-gray-900">Destination</h2>
            <div className="flex gap-2 mb-2">
              {[["snowflake", "Snowflake"], ["databricks", "Databricks"], ["big_query", "BigQuery"]].map(([id, label]) => (
                <button key={id} onClick={() => set("destination", id)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors ${config.destination === id ? "border-brand bg-brand-light text-brand" : "border-gray-200 text-gray-500"}`}>
                  {label}
                </button>
              ))}
            </div>
            {config.destination === "snowflake" && (
              <>
                <Field label="Snowflake account URL" placeholder="org-account.snowflakecomputing.com" value={config.snowflakeAccount ?? ""} onChange={(v) => set("snowflakeAccount", v)} />
                <Field label="Snowflake username" placeholder="FIVETRAN_USER" value={config.snowflakeUser ?? ""} onChange={(v) => set("snowflakeUser", v)} />
                <TextareaField label="RSA Private Key (PKCS#8 PEM)" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" value={config.snowflakePatToken ?? ""} onChange={(v) => set("snowflakePatToken", v)} />
                <p className="text-xs text-gray-400 -mt-2">Generate with: <code>openssl genrsa | openssl pkcs8 -topk8 -nocrypt</code>. Register the public key in Snowflake: <code>ALTER USER &lt;user&gt; SET RSA_PUBLIC_KEY='...'</code></p>
                <Field label="Warehouse" placeholder="HANDS_ON_LAB_WAREHOUSE" value={config.snowflakeWarehouse ?? ""} onChange={(v) => set("snowflakeWarehouse", v)} />
              </>
            )}
            {config.destination === "databricks" && (
              <>
                <Field label="Databricks host" placeholder="https://adb-xxx.azuredatabricks.net" value={config.databricksHost ?? ""} onChange={(v) => set("databricksHost", v)} />
                <Field label="PAT Token" type="password" value={config.databricksPatToken ?? ""} onChange={(v) => set("databricksPatToken", v)} />
                <Field label="Warehouse ID" value={config.databricksWarehouseId ?? ""} onChange={(v) => set("databricksWarehouseId", v)} />
              </>
            )}
            {config.destination === "big_query" && (
              <>
                <Field label="BigQuery dataset name" placeholder="fivetran_mdls" value={config.bigqueryDataset ?? ""} onChange={(v) => set("bigqueryDataset", v)} />
                <p className="text-xs text-gray-400 -mt-2">
                  Fivetran will create external BigQuery tables in this dataset over the GCS lake files. Auth uses your existing GCP credentials — no extra setup needed.
                </p>
              </>
            )}
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <CheckCircle size={36} className="text-green-500" />
            <p className="font-medium text-gray-900">Setup complete</p>
            <p className="text-sm text-gray-500">Redirecting to your demo portal...</p>
          </div>
        )}
      </div>

      {step !== "done" && (
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between">
          {currentIdx > 0 ? (
            <button onClick={() => setStep(STEPS[currentIdx - 1].id)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
          ) : <span />}
          <button
            onClick={validateAndNext}
            disabled={validating}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm rounded hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {validating && <Loader2 size={13} className="animate-spin" />}
            {step === "destination" ? "Finish Setup" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, placeholder, value, onChange, type = "text" }: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-brand" />
    </div>
  );
}

function TextareaField({ label, placeholder, value, onChange }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={5}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-brand font-mono text-xs" />
    </div>
  );
}
