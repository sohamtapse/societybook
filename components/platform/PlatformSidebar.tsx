"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Layers,
  ShieldAlert,
  LogOut,
  LayoutDashboard,
  ExternalLink,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function PlatformSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/platform-login");
    router.refresh();
  }

  const navItems = [
    { label: "Overview", href: "/platform", icon: LayoutDashboard },
    { label: "Societies & Quotas", href: "/platform/societies", icon: Building2 },
    { label: "Plans & Billing", href: "/platform/plans", icon: Layers },
  ];

  return (
    <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between shrink-0 min-h-screen text-zinc-700 dark:text-zinc-300 transition-colors">
      <div>
        {/* Brand */}
        <div className="h-16 px-6 flex items-center border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-950 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-950 font-bold text-sm tracking-wider">
              SB
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-950 dark:text-white tracking-tight leading-none">
                SocietyBook
              </div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                Super Admin Console
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-3 py-6 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Platform Operator
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800/90 text-zinc-950 dark:text-white shadow-2xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500"}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer controls */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
        <a
          href="/admin"
          className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            Society Portal Preview
          </span>
          <ExternalLink className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
        </a>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out Operator
        </button>
      </div>
    </aside>
  );
}
