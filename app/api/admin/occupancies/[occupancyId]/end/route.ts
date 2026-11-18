import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { flatOccupancies, flats } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ occupancyId: string }> }
) {
  try {
    const staff = await requireSocietyStaff(undefined, "flats.manage_occupancy");
    const { occupancyId } = await params;

    // Verify owner assignment belongs to staff's society
    const [existing] = await db
      .select()
      .from(flatOccupancies)
      .where(
        and(
          eq(flatOccupancies.id, occupancyId),
          eq(flatOccupancies.societyId, staff.societyId)
        )
      )
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Owner assignment not found" }, { status: 404 });
    }

    // Remove owner and set flat to vacant
    await db.transaction(async (tx) => {
      await tx.delete(flatOccupancies).where(eq(flatOccupancies.id, occupancyId));
      await tx
        .update(flats)
        .set({ status: "vacant", updatedAt: new Date() })
        .where(eq(flats.id, existing.flatId));
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "owner.remove",
      entityType: "flat_occupancies",
      entityId: occupancyId,
      metadata: { flatId: existing.flatId, residentId: existing.residentId },
    });

    return Response.json({ success: true, message: "Owner removed and flat marked vacant" });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("DELETE /api/admin/occupancies/[occupancyId]/end error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Support PATCH for ending occupancy as well
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ occupancyId: string }> }
) {
  return DELETE(request, context);
}
