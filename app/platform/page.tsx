import { count, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { societies, subscriptions, plans, platformAuditLogs } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ShieldCheck, ArrowUpRight, Activity } from "lucide-react";
import { purgeExpiredAuditLogs } from "@/lib/audit";

export const instant = false;

export default async function PlatformDashboardPage() {
  try {
    await requirePlatformAdmin();
  } catch {
    redirect("/platform-login");
  }

  // Auto-purge audit logs older than 2 days to optimize storage footprint
  await purgeExpiredAuditLogs(2);

  const [societyCount] = await db.select({ val: count() }).from(societies);
  const [activeSubsCount] = await db
    .select({ val: count() })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));
  const [plansCount] = await db.select({ val: count() }).from(plans);

  // Fetch recent platform audit logs within the 2-day retention window
  const recentLogs = await db
    .select({
      id: platformAuditLogs.id,
      action: platformAuditLogs.action,
      entityType: platformAuditLogs.entityType,
      createdAt: platformAuditLogs.createdAt,
    })
    .from(platformAuditLogs)
    .orderBy(desc(platformAuditLogs.createdAt))
    .limit(50);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-wider mb-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          Multi-Tenant SaaS Foundation
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Platform Overview
        </h1>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Manage tenant societies, plan quotas, and platform operational state.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-mono">
            <span>Onboarded Societies</span>
            <Building2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-zinc-950 dark:text-white tracking-tight">
            {societyCount?.val ?? 0}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Isolated database tenants</p>
        </div>

        <div className="p-4 sm:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-mono">
            <span>Active Subscriptions</span>
            <Activity className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-zinc-950 dark:text-white tracking-tight">
            {activeSubsCount?.val ?? 0}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">SaaS subscription billing</p>
        </div>

        <div className="p-4 sm:p-5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2 font-mono">
            <span>Configured Plans</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">Tiers</span>
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-zinc-950 dark:text-white tracking-tight">
            {plansCount?.val ?? 0}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Flat &amp; user limits defined</p>
        </div>
      </div>

      {/* Quick Launch & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Quick actions */}
        <div className="p-5 sm:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/20 shadow-2xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Operator Quick Actions</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Provision new cooperative societies or configure SaaS subscription plans.
            </p>
          </div>
          <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <Link
              href="/platform/societies"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-medium text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs"
            >
              Onboard Society
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/platform/plans"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 font-medium text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Manage Plans
            </Link>
          </div>
        </div>

        {/* Audit stream preview */}
        <div className="p-5 sm:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/20 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="min-w-0 pr-2">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white truncate">Platform Audit Stream</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                Top 4 visible · Purged after 2 days
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50 shrink-0">
              {recentLogs.length} events
            </span>
          </div>
          {recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-600 font-mono">
              No platform operator actions recorded in the last 2 days.
            </div>
          ) : (
            <div className="max-h-[148px] overflow-y-auto pr-1.5 space-y-0.5 [scrollbar-width:thin]">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-2 text-xs py-2 px-1 border-b border-zinc-100 dark:border-zinc-900/80 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 rounded transition-colors"
                >
                  <span className="font-mono text-zinc-800 dark:text-zinc-300 font-medium truncate">
                    {log.action}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-500 text-[11px] font-mono shrink-0">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
