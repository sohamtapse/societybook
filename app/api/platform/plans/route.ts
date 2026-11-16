import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { requirePlatformAdmin, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logPlatformAction } from "@/lib/audit";

const planSchema = z.object({
  code: z.string().min(2).max(64),
  name: z.string().min(2).max(128),
  description: z.string().optional(),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
  priceInr: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid currency decimal string"),
  maxFlatsDefault: z.number().int().positive(),
  maxUsersDefault: z.number().int().positive(),
  features: z.record(z.string(), z.boolean()).optional(),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    const list = await db.select().from(plans);
    return Response.json({ plans: list });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/platform/plans error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await request.json();
    const parsed = planSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const [existing] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, data.code))
      .limit(1);

    if (existing) {
      return Response.json({ error: `Plan code "${data.code}" already exists` }, { status: 409 });
    }

    const [newPlan] = await db
      .insert(plans)
      .values({
        code: data.code,
        name: data.name,
        description: data.description,
        billingCycle: data.billingCycle,
        priceInr: data.priceInr,
        maxFlatsDefault: data.maxFlatsDefault,
        maxUsersDefault: data.maxUsersDefault,
        featuresJson: data.features ?? {},
      })
      .returning();

    await logPlatformAction({
      platformUserId: admin.id,
      action: "plan.create",
      entityType: "plans",
      entityId: newPlan.id,
      metadata: { code: newPlan.code, price: newPlan.priceInr },
    });

    return Response.json({ success: true, plan: newPlan }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/platform/plans error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
