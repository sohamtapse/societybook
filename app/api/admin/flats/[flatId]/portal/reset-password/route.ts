import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { flats, flatPortalAccounts } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { resetFlatPortalPassword } from "@/lib/services/provisioning";
import { logSocietyAction } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flatId: string }> }
) {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

  try {
    const staff = await requireSocietyStaff(undefined, "flats.reset_credentials");
    const { flatId } = await params;

    // Verify flat belongs to staff's society
    const [flatRecord] = await db
      .select({ id: flats.id, flatNumber: flats.flatNumber })
      .from(flats)
      .where(and(eq(flats.id, flatId), eq(flats.societyId, staff.societyId)))
      .limit(1);

    if (!flatRecord) {
      return Response.json({ error: "Flat not found in your society" }, { status: 404 });
    }

    // Find the portal account
    const [portalAccount] = await db
      .select({ id: flatPortalAccounts.id, username: flatPortalAccounts.username })
      .from(flatPortalAccounts)
      .where(
        and(
          eq(flatPortalAccounts.flatId, flatId),
          eq(flatPortalAccounts.societyId, staff.societyId)
        )
      )
      .limit(1);

    if (!portalAccount) {
      return Response.json(
        { error: "No portal account provisioned for this flat" },
        { status: 404 }
      );
    }

    // Execute atomic reset
    const result = await db.transaction(async (tx) => {
      return resetFlatPortalPassword(tx, {
        societyId: staff.societyId,
        flatPortalAccountId: portalAccount.id,
        adminUserId: staff.id,
        ipAddress,
      });
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "portal.reset_password",
      entityType: "flat_portal_accounts",
      entityId: portalAccount.id,
      metadata: {
        flatNumber: flatRecord.flatNumber,
        username: portalAccount.username,
        newCredentialVersion: result.newCredentialVersion,
      },
      ipAddress,
    });

    return Response.json({
      success: true,
      username: portalAccount.username,
      temporaryPassword: result.temporaryPassword, // Displayed to admin ONCE
      message: "Password reset successful. All active resident sessions have been revoked.",
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/flats/[flatId]/portal/reset-password error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
