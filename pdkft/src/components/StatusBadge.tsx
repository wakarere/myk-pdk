const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:            { label: "Pending",        className: "bg-gray-100 text-gray-600" },
  preflight_running:  { label: "Preflight",      className: "bg-blue-50 text-blue-700" },
  preflight_failed:   { label: "Preflight Failed", className: "bg-red-50 text-red-700" },
  provisioning:       { label: "Provisioning",   className: "bg-amber-50 text-amber-700 animate-pulse" },
  qa_running:         { label: "QA Running",     className: "bg-purple-50 text-purple-700 animate-pulse" },
  qa_failed:          { label: "QA Failed",      className: "bg-red-50 text-red-700" },
  demo_ready:         { label: "Demo Ready",     className: "bg-green-50 text-green-700 font-semibold" },
  tearing_down:       { label: "Tearing Down",   className: "bg-orange-50 text-orange-700 animate-pulse" },
  done:               { label: "Done",           className: "bg-gray-100 text-gray-500" },
  failed:             { label: "Failed",         className: "bg-red-50 text-red-700" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
