import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { wings, buildings } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const createWingSchema = z.object({
  buildingId: z.string().uuid(),
  name: z.string().min(1).max(128),
  code: z.string().min(1).max(32).transform((v) => v.toUpperCase().trim()),
});

export async function GET(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();
    const { searchParams } = new URL(request.url);
    const buildingId = searchParams.get("buildingId");

    const query = db
      .select({
        id: wings.id,
        buildingId: wings.buildingId,
        buildingName: buildings.name,
        name: wings.name,
        code: wings.code,
        createdAt: wings.createdAt,
      })
      .from(wings)
      .innerJoin(buildings, and(eq(buildings.id, wings.buildingId), eq(buildings.societyId, staff.societyId)))
      .where(
        buildingId
          ? and(eq(wings.societyId, staff.societyId), eq(wings.buildingId, buildingId))
          : eq(wings.societyId, staff.societyId)
      )
      .orderBy(wings.name);

    const list = await query;
    return Response.json({ wings: list });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/wings error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "buildings.create");
    const body = await request.json();
    const parsed = createWingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { buildingId, name, code } = parsed.data;

    // Verify building belongs to staff's society
    const [building] = await db
      .select({ id: buildings.id, name: buildings.name })
      .from(buildings)
      .where(and(eq(buildings.id, buildingId), eq(buildings.societyId, staff.societyId)))
      .limit(1);

    if (!building) {
      return Response.json(
        { error: "Building not found in your society" },
        { status: 404 }
      );
    }

    // Check code uniqueness under this building
    const [existing] = await db
      .select({ id: wings.id })
      .from(wings)
      .where(
        and(
          eq(wings.societyId, staff.societyId),
          eq(wings.buildingId, buildingId),
          eq(wings.code, code)
        )
      )
      .limit(1);

    if (existing) {
      return Response.json(
        { error: `Wing '${code}' already exists in building '${building.name}'` },
        { status: 409 }
      );
    }

    const [newWing] = await db
      .insert(wings)
      .values({
        societyId: staff.societyId,
        buildingId,
        name: name.trim(),
        code,
      })
      .returning();

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "wing.create",
      entityType: "wings",
      entityId: newWing.id,
      metadata: { name: newWing.name, code: newWing.code, buildingId },
    });

    return Response.json({ success: true, wing: newWing }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/wings error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
