import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  flats,
  buildings,
  wings,
  flatPortalAccounts,
  flatOccupancies,
  residents,
} from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ flatId: string }> }
) {
  try {
    const staff = await requireSocietyStaff();
    const { flatId } = await params;

    // 1. Fetch flat details
    const [flatRecord] = await db
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
        createdAt: flats.createdAt,
        updatedAt: flats.updatedAt,
      })
      .from(flats)
      .leftJoin(buildings, and(eq(buildings.id, flats.buildingId), eq(buildings.societyId, staff.societyId)))
      .leftJoin(wings, and(eq(wings.id, flats.wingId), eq(wings.societyId, staff.societyId)))
      .where(and(eq(flats.id, flatId), eq(flats.societyId, staff.societyId)))
      .limit(1);

    if (!flatRecord) {
      return Response.json({ error: "Flat not found" }, { status: 404 });
    }

    // 2. Fetch portal account (safe fields only)
    const [portalAccount] = await db
      .select({
        id: flatPortalAccounts.id,
        username: flatPortalAccounts.username,
        status: flatPortalAccounts.status,
        credentialVersion: flatPortalAccounts.credentialVersion,
        passwordChangedAt: flatPortalAccounts.passwordChangedAt,
        lastLoginAt: flatPortalAccounts.lastLoginAt,
        createdAt: flatPortalAccounts.createdAt,
      })
      .from(flatPortalAccounts)
      .where(
        and(
          eq(flatPortalAccounts.flatId, flatId),
          eq(flatPortalAccounts.societyId, staff.societyId)
        )
      )
      .limit(1);

    // 3. Fetch single flat owner (strictly 1 owner per flat)
    const [ownerRecord] = await db
      .select({
        occupancyId: flatOccupancies.id,
        residentId: residents.id,
        fullName: residents.fullName,
        email: residents.email,
        phone: residents.phone,
        startDate: flatOccupancies.startDate,
      })
      .from(flatOccupancies)
      .innerJoin(
        residents,
        and(eq(residents.id, flatOccupancies.residentId), eq(residents.societyId, staff.societyId))
      )
      .where(
        and(
          eq(flatOccupancies.flatId, flatId),
          eq(flatOccupancies.societyId, staff.societyId)
        )
      )
      .limit(1);

    return Response.json({
      flat: flatRecord,
      portalAccount: portalAccount ?? null,
      owner: ownerRecord ?? null,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/flats/[flatId] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
