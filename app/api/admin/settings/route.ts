import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { societySettings } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const updateSettingsSchema = z.object({
  financialYearStartMonth: z.number().int().min(1).max(12).default(4), // April
  financialYearStartDay: z.number().int().min(1).max(31).default(1),
  overdueInterestRateAnnual: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0.00"),
  receiptPrefix: z.string().min(1).max(16).default("REC"),
  voucherPrefix: z.string().min(1).max(16).default("JV"),
  residentComplaintsVisible: z.boolean().default(true),
});

export async function GET(_request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();

    let [settings] = await db
      .select()
      .from(societySettings)
      .where(eq(societySettings.societyId, staff.societyId))
      .limit(1);

    // If settings don't exist yet, lazily create defaults (April 1)
    if (!settings) {
      [settings] = await db
        .insert(societySettings)
        .values({
          societyId: staff.societyId,
          financialYearStartMonth: 4,
          financialYearStartDay: 1,
          currencyCode: "INR",
          overdueInterestRateAnnual: "0.00",
          receiptPrefix: "REC",
          voucherPrefix: "JV",
          residentComplaintsVisible: true,
        })
        .returning();
    }

    return Response.json({ settings });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/settings error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "society.manage_settings");
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    let [settings] = await db
      .select()
      .from(societySettings)
      .where(eq(societySettings.societyId, staff.societyId))
      .limit(1);

    let updated;
    if (!settings) {
      [updated] = await db
        .insert(societySettings)
        .values({
          societyId: staff.societyId,
          ...data,
          currencyCode: "INR",
          updatedAt: new Date(),
        })
        .returning();
    } else {
      [updated] = await db
        .update(societySettings)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(societySettings.societyId, staff.societyId))
        .returning();
    }

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "settings.update",
      entityType: "society_settings",
      entityId: updated.id,
      metadata: data,
    });

    return Response.json({ success: true, settings: updated });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("PUT /api/admin/settings error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
