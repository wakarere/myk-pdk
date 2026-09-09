"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, BarChart2, Settings, BookOpen } from "lucide-react";

const navItems = [
  { href: "/demos", label: "Demos", icon: FlaskConical },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/resources", label: "Resources", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function PartnerSidebar({ orgName }: { orgName?: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-52 h-screen bg-sidebar-bg text-sidebar-text flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <span className="text-white font-semibold text-lg tracking-tight">PDK</span>
        <span className="ml-2 text-xs text-sidebar-text uppercase tracking-widest">partner</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-sidebar-active text-sidebar-text-active"
                  : "hover:bg-sidebar-hover hover:text-white"
              }`}
            >
              <Icon size={16} className={active ? "text-white" : "text-sidebar-text"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Org info */}
      {orgName && (
        <div className="px-4 py-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-text-active font-medium truncate">{orgName}</p>
          <p className="text-xs text-sidebar-text mt-0.5">Partner Portal</p>
        </div>
      )}
    </aside>
  );
}
