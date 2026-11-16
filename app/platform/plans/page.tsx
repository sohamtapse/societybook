import { db } from "@/db";
import { plans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { Check, Layers } from "lucide-react";

export const instant = false;

export default async function PlatformPlansPage() {
  try {
    await requirePlatformAdmin();
  } catch {
    redirect("/platform-login");
  }

  const allPlans = await db.select().from(plans);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 dark:text-white">
          SaaS Plans &amp; Tiers
        </h1>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          Subscription pricing tiers, billing cycles, and allocated quota templates.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {allPlans.map((plan) => (
          <div
            key={plan.id}
            className="p-5 sm:p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 flex flex-col justify-between shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {plan.code}
                </span>
                <span className="text-[11px] font-mono text-zinc-500 capitalize">
                  {plan.billingCycle}
                </span>
              </div>

              <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">{plan.name}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 min-h-[32px]">
                {plan.description || "Housing society management subscription"}
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-zinc-950 dark:text-white">
                  ₹{Number(plan.priceInr).toLocaleString("en-IN")}
                </span>
                <span className="text-xs text-zinc-500">
                  /{plan.billingCycle === "annual" ? "year" : "month"}
                </span>
              </div>

              <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Up to <strong>{plan.maxFlatsDefault} flats</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Up to <strong>{plan.maxUsersDefault} staff admins</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Double-entry accounting engine</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Direct-to-society UPI payments</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800/60 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              SaaS Subscription Tier
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
