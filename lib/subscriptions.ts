import { db } from "@/db";
import { societies, subscriptions } from "@/db/schema";
import { and, eq, lte, inArray } from "drizzle-orm";

/**
 * Reconciles expired society subscriptions and automatically suspends societies
 * whose active subscription period has ended.
 * Can be called during platform queries or scheduled cron jobs.
 */
export async function reconcileExpiredSubscriptions() {
  const now = new Date();

  // Find all subscriptions that are marked 'active' but expiresAt <= now
  const expiredSubs = await db
    .select({
      id: subscriptions.id,
      societyId: subscriptions.societyId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        lte(subscriptions.expiresAt, now)
      )
    );

  if (expiredSubs.length === 0) {
    return { count: 0 };
  }

  const expiredIds = expiredSubs.map((s) => s.id);
  const societyIds = Array.from(new Set(expiredSubs.map((s) => s.societyId)));

  await db.transaction(async (tx) => {
    // 1. Mark subscription as expired
    await tx
      .update(subscriptions)
      .set({ status: "expired", updatedAt: now })
      .where(inArray(subscriptions.id, expiredIds));

    // 2. Automatically suspend the societies
    await tx
      .update(societies)
      .set({ status: "suspended", updatedAt: now })
      .where(
        and(
          inArray(societies.id, societyIds),
          eq(societies.status, "active")
        )
      );
  });

  return { count: expiredSubs.length, societyIds };
}

