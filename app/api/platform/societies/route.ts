import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { societies, plans, societyLimits, subscriptions } from "@/db/schema";
import { requirePlatformAdmin, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logPlatformAction } from "@/lib/audit";

const createSocietySchema = z.object({
  code: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, "Code must contain only uppercase alphanumeric, dashes, or underscores"),
  name: z.string().min(2).max(255),
  registrationNumber: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().default("Maharashtra"),
  pincode: z.string().max(16).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  planId: z.string().uuid(),
  customMaxFlats: z.number().int().positive().optional(),
  customMaxUsers: z.number().int().positive().optional(),
});

export async function GET() {
  try {
    await requirePlatformAdmin();

    const list = await db
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
      })
      .from(societies)
      .leftJoin(societyLimits, eq(societyLimits.societyId, societies.id));

    return Response.json({ societies: list });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/platform/societies error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await request.json();
    const parsed = createSocietySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check unique society code
    const [existing] = await db
      .select({ id: societies.id })
      .from(societies)
      .where(eq(societies.code, data.code))
      .limit(1);

    if (existing) {
      return Response.json({ error: `Society code "${data.code}" already exists` }, { status: 409 });
    }

    // Verify chosen plan
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, data.planId))
      .limit(1);

    if (!plan) {
      return Response.json({ error: "Selected plan does not exist" }, { status: 400 });
    }

    const maxFlats = data.customMaxFlats ?? plan.maxFlatsDefault;
    const maxUsers = data.customMaxUsers ?? plan.maxUsersDefault;

    // Create Society, Limits, and Subscription atomically in a transaction
    const result = await db.transaction(async (tx) => {
      const [newSociety] = await tx
        .insert(societies)
        .values({
          code: data.code,
          name: data.name,
          registrationNumber: data.registrationNumber,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
        })
        .returning();

      await tx.insert(societyLimits).values({
        societyId: newSociety.id,
        maxFlats,
        maxUsers,
        updatedByPlatformUserId: admin.id,
      });

      const startsAt = new Date();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + (plan.billingCycle === "annual" ? 12 : 1));

      await tx.insert(subscriptions).values({
        societyId: newSociety.id,
        planId: plan.id,
        status: "active",
        startsAt,
        expiresAt,
      });

      return newSociety;
    });

    await logPlatformAction({
      platformUserId: admin.id,
      societyId: result.id,
      action: "society.create",
      entityType: "societies",
      entityId: result.id,
      metadata: { code: result.code, maxFlats, maxUsers, planId: plan.id },
    });

    return Response.json({ success: true, society: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/platform/societies error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
