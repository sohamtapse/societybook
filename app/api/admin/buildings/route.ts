import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { buildings, wings } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const createBuildingSchema = z.object({
  name: z.string().min(1).max(128),
  code: z.string().min(1).max(32).transform((v) => v.toUpperCase().trim()),
});

export async function GET(_request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();

    const buildingRows = await db
      .select()
      .from(buildings)
      .where(eq(buildings.societyId, staff.societyId))
      .orderBy(buildings.name);

    const wingRows = await db
      .select()
      .from(wings)
      .where(eq(wings.societyId, staff.societyId))
      .orderBy(wings.name);

    // Group wings under their buildings
    const structured = buildingRows.map((b) => ({
      ...b,
      wings: wingRows.filter((w) => w.buildingId === b.id),
    }));

    return Response.json({ buildings: structured });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/buildings error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "buildings.create");
    const body = await request.json();
    const parsed = createBuildingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { name, code } = parsed.data;

    // Check code uniqueness within society
    const [existing] = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(and(eq(buildings.societyId, staff.societyId), eq(buildings.code, code)))
      .limit(1);

    if (existing) {
      return Response.json(
        { error: `Building with code '${code}' already exists in your society` },
        { status: 409 }
      );
    }

    const [newBuilding] = await db
      .insert(buildings)
      .values({
        societyId: staff.societyId,
        name: name.trim(),
        code,
      })
      .returning();

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "building.create",
      entityType: "buildings",
      entityId: newBuilding.id,
      metadata: { name: newBuilding.name, code: newBuilding.code },
    });

    return Response.json({ success: true, building: newBuilding }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/buildings error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
