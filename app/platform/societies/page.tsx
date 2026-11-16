import { db } from "@/db";
import { societies, societyLimits, plans, subscriptions } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { SocietiesClient } from "@/components/platform/SocietiesClient";
import { reconcileExpiredSubscriptions } from "@/lib/subscriptions";

export const instant = false;

export default async function PlatformSocietiesPage() {
  try {
    await requirePlatformAdmin();
  } catch {
    redirect("/platform-login");
  }

  // Automatically check and reconcile any expired subscriptions & suspend societies
  await reconcileExpiredSubscriptions();

  const societyRows = await db
    .select({
      id: societies.id,
      code: societies.code,
      name: societies.name,
      registrationNumber: societies.registrationNumber,
      city: societies.city,
      state: societies.state,
      status: societies.status,
      createdAt: societies.createdAt,
      maxFlats: societyLimits.maxFlats,
      maxUsers: societyLimits.maxUsers,
      subStartsAt: subscriptions.startsAt,
      subExpiresAt: subscriptions.expiresAt,
      subStatus: subscriptions.status,
    })
    .from(societies)
    .leftJoin(societyLimits, eq(societyLimits.societyId, societies.id))
    .leftJoin(subscriptions, eq(subscriptions.societyId, societies.id))
    .orderBy(desc(societies.createdAt));

  const planOptions = await db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      priceInr: plans.priceInr,
      maxFlatsDefault: plans.maxFlatsDefault,
      maxUsersDefault: plans.maxUsersDefault,
    })
    .from(plans);

  // Serialize timestamps for Client Component
  const serializedSocieties = societyRows.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    subStartsAt: s.subStartsAt ? s.subStartsAt.toISOString() : null,
    subExpiresAt: s.subExpiresAt ? s.subExpiresAt.toISOString() : null,
  }));

  return (
    <SocietiesClient
      initialSocieties={serializedSocieties}
      availablePlans={planOptions}
    />
  );
}
