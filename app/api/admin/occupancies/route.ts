import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { flatOccupancies, flats, residents } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

// Single owner assignment schema - exactly 1 owner per flat
const assignOwnerSchema = z.object({
  flatId: z.string().uuid(),
  residentId: z.string().uuid(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
    .optional()
    .default(() => new Date().toISOString().split("T")[0]),
});

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "flats.manage_occupancy");
    const body = await request.json();
    const parsed = assignOwnerSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify flat belongs to staff's society
    const [flatRecord] = await db
      .select({ id: flats.id, flatNumber: flats.flatNumber, status: flats.status })
      .from(flats)
      .where(and(eq(flats.id, data.flatId), eq(flats.societyId, staff.societyId)))
      .limit(1);

    if (!flatRecord) {
      return Response.json({ error: "Flat not found in your society" }, { status: 404 });
    }

    // Verify resident belongs to staff's society
    const [residentRecord] = await db
      .select({ id: residents.id, fullName: residents.fullName })
      .from(residents)
      .where(and(eq(residents.id, data.residentId), eq(residents.societyId, staff.societyId)))
      .limit(1);

    if (!residentRecord) {
      return Response.json({ error: "Resident not found in your society" }, { status: 404 });
    }

    const result = await db.transaction(async (tx) => {
      // Enforce strictly 1 owner per flat: remove any existing owner for this flat
      await tx
        .delete(flatOccupancies)
        .where(
          and(
            eq(flatOccupancies.flatId, data.flatId),
            eq(flatOccupancies.societyId, staff.societyId)
          )
        );

      // Insert the single flat owner record
      const [newOwner] = await tx
        .insert(flatOccupancies)
        .values({
          societyId: staff.societyId,
          flatId: data.flatId,
          residentId: data.residentId,
          occupancyType: "owner",
          isPrimary: true,
          startDate: data.startDate,
        })
        .returning();

      // Ensure flat status is marked occupied
      await tx
        .update(flats)
        .set({ status: "occupied", updatedAt: new Date() })
        .where(eq(flats.id, data.flatId));

      return newOwner;
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "owner.assign",
      entityType: "flat_occupancies",
      entityId: result.id,
      metadata: {
        flatNumber: flatRecord.flatNumber,
        ownerName: residentRecord.fullName,
      },
    });

    return Response.json({ success: true, owner: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/occupancies error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
