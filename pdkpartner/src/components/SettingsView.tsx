"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { OrgConfig } from "@prisma/client";

export function SettingsView({ current }: { current: OrgConfig | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    orgName: current?.orgName ?? "",
    fivetranApiKey: current?.fivetranApiKey ?? "",
    fivetranApiSecret: current?.fivetranApiSecret ?? "",
    fivetranAccount: current?.fivetranAccount ?? "",
    cloudProvider: current?.cloudProvider ?? "gcp",
    gcpProjectId: current?.gcpProjectId ?? "",
    gcpZone: current?.gcpZone ?? "us-central1-a",
    gcpKeyFilePath: current?.gcpKeyFilePath ?? "",
    destination: current?.destination ?? "snowflake",
    snowflakeAccount: current?.snowflakeAccount ?? "",
    snowflakeUser: current?.snowflakeUser ?? "",
    snowflakePatToken: current?.snowflakePatToken ?? "",
    snowflakeWarehouse: current?.snowflakeWarehouse ?? "",
    databricksHost: current?.databricksHost ?? "",
    databricksPatToken: current?.databricksPatToken ?? "",
    databricksWarehouseId: current?.databricksWarehouseId ?? "",
    bigqueryDataset: current?.bigqueryDataset ?? "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">Update your organization and credential configuration.</p>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          <CheckCircle size={14} />
          Settings saved successfully.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {/* Organization */}
        <section className="px-5 py-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Organization</h2>
          <Field label="Partner organization name" value={form.orgName} onChange={(v) => set("orgName", v)} />
        </section>

        {/* Fivetran */}
        <section className="px-5 py-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Fivetran Account</h2>
          <div className="space-y-3">
            <Field label="API Key" value={form.fivetranApiKey} onChange={(v) => set("fivetranApiKey", v)} />
            <Field label="API Secret" type="password" value={form.fivetranApiSecret} onChange={(v) => set("fivetranApiSecret", v)} />
            <Field label="Account label" value={form.fivetranAccount} onChange={(v) => set("fivetranAccount", v)} />
          </div>
        </section>

        {/* GCP */}
        <section className="px-5 py-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Cloud - GCP</h2>
          <div className="space-y-3">
            <Field label="GCP Project ID" value={form.gcpProjectId} onChange={(v) => set("gcpProjectId", v)} />
            <Field label="GCP Zone" value={form.gcpZone} onChange={(v) => set("gcpZone", v)} />
            <Field label="Service account key path (optional)" placeholder="/path/to/sa-key.json" value={form.gcpKeyFilePath} onChange={(v) => set("gcpKeyFilePath", v)} />
            <p className="text-xs text-gray-400">Leave key path blank to use Application Default Credentials.</p>
          </div>
        </section>

        {/* Destination */}
        <section className="px-5 py-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Destination</h2>
          <div className="flex gap-2 mb-3">
            {[["snowflake", "Snowflake"], ["databricks", "Databricks"], ["big_query", "BigQuery"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => set("destination", id)}
                className={`px-3 py-1.5 text-sm rounded border transition-colors ${form.destination === id ? "border-brand bg-brand-light text-brand" : "border-gray-200 text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {form.destination === "snowflake" && (
            <div className="space-y-3">
              <Field label="Snowflake account URL" placeholder="org-account.snowflakecomputing.com" value={form.snowflakeAccount} onChange={(v) => set("snowflakeAccount", v)} />
              <Field label="User" value={form.snowflakeUser} onChange={(v) => set("snowflakeUser", v)} />
              <Field label="PAT Token" type="password" value={form.snowflakePatToken} onChange={(v) => set("snowflakePatToken", v)} />
              <Field label="Warehouse" placeholder="COMPUTE_WH" value={form.snowflakeWarehouse} onChange={(v) => set("snowflakeWarehouse", v)} />
            </div>
          )}
          {form.destination === "databricks" && (
            <div className="space-y-3">
              <Field label="Databricks host" placeholder="https://adb-xxx.azuredatabricks.net" value={form.databricksHost} onChange={(v) => set("databricksHost", v)} />
              <Field label="PAT Token" type="password" value={form.databricksPatToken} onChange={(v) => set("databricksPatToken", v)} />
              <Field label="Warehouse ID" value={form.databricksWarehouseId} onChange={(v) => set("databricksWarehouseId", v)} />
            </div>
          )}
          {form.destination === "big_query" && (
            <div className="space-y-3">
              <Field label="BigQuery dataset name" placeholder="fivetran_mdls" value={form.bigqueryDataset} onChange={(v) => set("bigqueryDataset", v)} />
              <p className="text-xs text-gray-400">Auth uses your GCP credentials above. Leave blank to default to <code>fivetran_mdls</code>.</p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm rounded hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          Save Settings
        </button>
        <p className="text-xs text-gray-400">Changes take effect immediately for new demos.</p>
      </div>
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
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-brand"
      />
    </div>
  );
}
