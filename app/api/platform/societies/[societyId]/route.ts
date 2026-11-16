import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { societies, societyLimits, subscriptions } from "@/db/schema";
import { requirePlatformAdmin, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logPlatformAction } from "@/lib/audit";

const updateSocietySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  status: z.enum(["active", "suspended", "archived"]).optional(),
  maxFlats: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
  registrationNumber: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  subscriptionExpiresAt: z.string().datetime().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ societyId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { societyId } = await params;
    const body = await request.json();
    const parsed = updateSocietySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify society exists
    const [existing] = await db
      .select()
      .from(societies)
      .where(eq(societies.id, societyId))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Society not found" }, { status: 404 });
    }

    // Update in atomic transaction
    const updated = await db.transaction(async (tx) => {
      // 1. Update society fields if provided
      const societyUpdates: Partial<typeof societies.$inferInsert> = {};
      if (data.name !== undefined) societyUpdates.name = data.name;
      if (data.status !== undefined) societyUpdates.status = data.status;
      if (data.registrationNumber !== undefined) societyUpdates.registrationNumber = data.registrationNumber;
      if (data.city !== undefined) societyUpdates.city = data.city;
      if (data.state !== undefined) societyUpdates.state = data.state;
      societyUpdates.updatedAt = new Date();

      const [updatedSoc] = await tx
        .update(societies)
        .set(societyUpdates)
        .where(eq(societies.id, societyId))
        .returning();

      // 2. Update quotas if provided
      if (data.maxFlats !== undefined || data.maxUsers !== undefined) {
        const limitUpdates: Partial<typeof societyLimits.$inferInsert> = {
          updatedByPlatformUserId: admin.id,
          updatedAt: new Date(),
        };
        if (data.maxFlats !== undefined) limitUpdates.maxFlats = data.maxFlats;
        if (data.maxUsers !== undefined) limitUpdates.maxUsers = data.maxUsers;

        await tx
          .update(societyLimits)
          .set(limitUpdates)
          .where(eq(societyLimits.societyId, societyId));
      }

      // 3. Update subscription expiry if provided
      if (data.subscriptionExpiresAt !== undefined) {
        const newExpiry = new Date(data.subscriptionExpiresAt);
        await tx
          .update(subscriptions)
          .set({
            expiresAt: newExpiry,
            status: newExpiry > new Date() ? "active" : "expired",
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.societyId, societyId));

        // If extended and was suspended, reactivate
        if (newExpiry > new Date() && updatedSoc.status === "suspended") {
          await tx
            .update(societies)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(societies.id, societyId));
          updatedSoc.status = "active";
        }
      }

      const [currentLimit] = await tx
        .select()
        .from(societyLimits)
        .where(eq(societyLimits.societyId, societyId))
        .limit(1);

      return {
        ...updatedSoc,
        maxFlats: currentLimit?.maxFlats ?? null,
        maxUsers: currentLimit?.maxUsers ?? null,
      };
    });

    await logPlatformAction({
      platformUserId: admin.id,
      societyId,
      action: "society.update",
      entityType: "societies",
      entityId: societyId,
      metadata: data,
    });

    return Response.json({ success: true, society: updated });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("PATCH /api/platform/societies/[societyId] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

