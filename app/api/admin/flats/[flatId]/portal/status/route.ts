import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { flats, flatPortalAccounts } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { toggleFlatPortalStatus } from "@/lib/services/provisioning";
import { logSocietyAction } from "@/lib/audit";

const statusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ flatId: string }> }
) {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";

  try {
    const staff = await requireSocietyStaff(undefined, "flats.manage_credentials");
    const { flatId } = await params;
    const body = await request.json();
    const parsed = statusSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { status } = parsed.data;

    // Verify flat belongs to staff's society
    const [flatRecord] = await db
      .select({ id: flats.id, flatNumber: flats.flatNumber })
      .from(flats)
      .where(and(eq(flats.id, flatId), eq(flats.societyId, staff.societyId)))
      .limit(1);

    if (!flatRecord) {
      return Response.json({ error: "Flat not found in your society" }, { status: 404 });
    }

    // Find portal account
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

    await db.transaction(async (tx) => {
      await toggleFlatPortalStatus(tx, {
        societyId: staff.societyId,
        flatPortalAccountId: portalAccount.id,
        status,
        adminUserId: staff.id,
        ipAddress,
      });
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: status === "disabled" ? "portal.disable" : "portal.activate",
      entityType: "flat_portal_accounts",
      entityId: portalAccount.id,
      metadata: { flatNumber: flatRecord.flatNumber, username: portalAccount.username, status },
      ipAddress,
    });

    return Response.json({
      success: true,
      username: portalAccount.username,
      status,
      message: `Portal account for flat ${flatRecord.flatNumber} has been ${status}`,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("PATCH /api/admin/flats/[flatId]/portal/status error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
