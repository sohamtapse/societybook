import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, count, and } from "drizzle-orm";
import { db } from "@/db";
import {
  flats,
  societyLimits,
  societies,
  buildings,
  wings,
  flatPortalAccounts,
  flatOccupancies,
  residents,
} from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";
import { provisionFlatPortalAccount } from "@/lib/services/provisioning";

const createFlatSchema = z.object({
  flatNumber: z.string().min(1).max(32),
  buildingId: z.string().uuid().optional().nullable(),
  wingId: z.string().uuid().optional().nullable(),
  floorNumber: z.number().int().optional().nullable(),
  areaSqFt: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  flatType: z.enum(["residential", "commercial"]).default("residential"),
  status: z.enum(["occupied", "vacant", "under_renovation"]).default("occupied"),
});

export async function GET(_request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();

    // Query flats with building, wing, portal account, and single owner info
    const flatRows = await db
      .select({
        id: flats.id,
        societyId: flats.societyId,
        flatNumber: flats.flatNumber,
        floorNumber: flats.floorNumber,
        areaSqFt: flats.areaSqFt,
        flatType: flats.flatType,
        status: flats.status,
        buildingId: flats.buildingId,
        wingId: flats.wingId,
        buildingName: buildings.name,
        wingName: wings.name,
        portalAccountId: flatPortalAccounts.id,
        portalUsername: flatPortalAccounts.username,
        portalStatus: flatPortalAccounts.status,
        ownerName: residents.fullName,
        ownerPhone: residents.phone,
        ownerEmail: residents.email,
        createdAt: flats.createdAt,
      })
      .from(flats)
      .leftJoin(buildings, and(eq(buildings.id, flats.buildingId), eq(buildings.societyId, staff.societyId)))
      .leftJoin(wings, and(eq(wings.id, flats.wingId), eq(wings.societyId, staff.societyId)))
      .leftJoin(flatPortalAccounts, and(eq(flatPortalAccounts.flatId, flats.id), eq(flatPortalAccounts.societyId, staff.societyId)))
      .leftJoin(flatOccupancies, and(eq(flatOccupancies.flatId, flats.id), eq(flatOccupancies.societyId, staff.societyId)))
      .leftJoin(residents, and(eq(residents.id, flatOccupancies.residentId), eq(residents.societyId, staff.societyId)))
      .where(eq(flats.societyId, staff.societyId))
      .orderBy(flats.flatNumber);

    return Response.json({ flats: flatRows });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/flats error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

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

    // 1. Fetch society record for code prefix
    const [societyRecord] = await db
      .select({ code: societies.code })
      .from(societies)
      .where(eq(societies.id, staff.societyId))
      .limit(1);

    if (!societyRecord) {
      return Response.json({ error: "Society not found" }, { status: 404 });
    }

    // 2. Atomic transaction enforcing quota and provisioning flat portal account
    const result = await db.transaction(async (tx) => {
      // Check current limit
      const [limitRecord] = await tx
        .select({ maxFlats: societyLimits.maxFlats })
        .from(societyLimits)
        .where(eq(societyLimits.societyId, staff.societyId))
        .limit(1);

      const maxAllowed = limitRecord?.maxFlats ?? 50;

      // Count existing flats
      const [existingCountResult] = await tx
        .select({ count: count() })
        .from(flats)
        .where(eq(flats.societyId, staff.societyId));

      const currentCount = existingCountResult?.count ?? 0;

      if (currentCount >= maxAllowed) {
        throw new Error(`SOCIETY_FLAT_LIMIT_REACHED: Maximum flat limit of ${maxAllowed} reached`);
      }

      // Validate buildingId if provided belongs to staff's society
      if (data.buildingId) {
        const [validBldg] = await tx
          .select({ id: buildings.id })
          .from(buildings)
          .where(and(eq(buildings.id, data.buildingId), eq(buildings.societyId, staff.societyId)))
          .limit(1);
        if (!validBldg) throw new Error("INVALID_BUILDING: Building does not belong to your society");
      }

      // Validate wingId if provided belongs to staff's society
      if (data.wingId) {
        const [validWing] = await tx
          .select({ id: wings.id })
          .from(wings)
          .where(and(eq(wings.id, data.wingId), eq(wings.societyId, staff.societyId)))
          .limit(1);
        if (!validWing) throw new Error("INVALID_WING: Wing does not belong to your society");
      }

      // Insert new flat scoped strictly to staff's society
      const [newFlat] = await tx
        .insert(flats)
        .values({
          societyId: staff.societyId,
          flatNumber: data.flatNumber.trim(),
          buildingId: data.buildingId,
          wingId: data.wingId,
          floorNumber: data.floorNumber,
          areaSqFt: data.areaSqFt,
          flatType: data.flatType,
          status: data.status,
        })
        .returning();

      // Automatically provision resident portal account with temporary password
      const { account: portalAccount, temporaryPassword } = await provisionFlatPortalAccount(tx, {
        societyId: staff.societyId,
        flatId: newFlat.id,
        societyCode: societyRecord.code,
        flatNumber: newFlat.flatNumber,
        adminUserId: staff.id,
        ipAddress,
      });

      return {
        flat: newFlat,
        portalAccount: {
          id: portalAccount.id,
          username: portalAccount.username,
          status: portalAccount.status,
        },
        temporaryPassword,
      };
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "flat.create_and_provision",
      entityType: "flats",
      entityId: result.flat.id,
      metadata: {
        flatNumber: result.flat.flatNumber,
        username: result.portalAccount.username,
      },
      ipAddress,
    });

    return Response.json(
      {
        success: true,
        flat: result.flat,
        portalAccount: result.portalAccount,
        initialPassword: result.temporaryPassword, // Shown to admin ONCE upon provisioning
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SOCIETY_FLAT_LIMIT_REACHED")) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && (error.message.startsWith("INVALID_BUILDING") || error.message.startsWith("INVALID_WING"))) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/flats error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
