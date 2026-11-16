import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { flats, societyLimits } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const createFlatSchema = z.object({
  flatNumber: z.string().min(1).max(32),
  floorNumber: z.number().int().optional(),
  areaSqFt: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  flatType: z.enum(["residential", "commercial"]).default("residential"),
});

export async function GET() {
  try {
    const staff = await requireSocietyStaff();

    const list = await db
      .select()
      .from(flats)
      .where(eq(flats.societyId, staff.societyId));

    return Response.json({ flats: list });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/flats error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "flats.create");
    const body = await request.json();
    const parsed = createFlatSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Transaction to safely enforce society limits under concurrent inserts
    const newFlat = await db.transaction(async (tx) => {
      // 1. Fetch current limit
      const [limitRecord] = await tx
        .select({ maxFlats: societyLimits.maxFlats })
        .from(societyLimits)
        .where(eq(societyLimits.societyId, staff.societyId))
        .limit(1);

      const maxAllowed = limitRecord?.maxFlats ?? 50;

      // 2. Count existing flats
      const [existingCountResult] = await tx
        .select({ count: count() })
        .from(flats)
        .where(eq(flats.societyId, staff.societyId));

      const currentCount = existingCountResult?.count ?? 0;

      if (currentCount >= maxAllowed) {
        throw new Error(`SOCIETY_FLAT_LIMIT_REACHED: Maximum flat limit of ${maxAllowed} reached`);
      }

      // 3. Insert new flat scoped strictly to staff's society
      const [flat] = await tx
        .insert(flats)
        .values({
          societyId: staff.societyId,
          flatNumber: data.flatNumber,
          floorNumber: data.floorNumber,
          areaSqFt: data.areaSqFt,
          flatType: data.flatType,
        })
        .returning();

      return flat;
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "flat.create",
      entityType: "flats",
      entityId: newFlat.id,
      metadata: { flatNumber: newFlat.flatNumber },
    });

    return Response.json({ success: true, flat: newFlat }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SOCIETY_FLAT_LIMIT_REACHED")) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/flats error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
