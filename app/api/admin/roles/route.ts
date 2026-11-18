import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { societyRoles } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const createRoleSchema = z.object({
  name: z.string().min(2).max(128),
  description: z.string().max(255).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let rolesList = await db
      .select({
        id: societyRoles.id,
        name: societyRoles.name,
        description: societyRoles.description,
        isSystemAdmin: societyRoles.isSystemAdmin,
        createdAt: societyRoles.createdAt,
      })
      .from(societyRoles)
      .where(eq(societyRoles.societyId, staff.societyId))
      .orderBy(societyRoles.name);

    // If society has no roles initialized yet, seed standard Maharashtra society roles
    if (rolesList.length === 0) {
      const standardRoles = [
        { name: "Society Admin", description: "Full society administrative privileges", isSystemAdmin: true },
        { name: "Chairman", description: "Managing committee chairman with approval authorities", isSystemAdmin: false },
        { name: "Secretary", description: "Society secretary managing operations and communications", isSystemAdmin: false },
        { name: "Treasurer", description: "Managing financial records and accounting approvals", isSystemAdmin: false },
        { name: "Accountant", description: "Day-to-day bookkeeper and invoice clerk", isSystemAdmin: false },
        { name: "Committee Member", description: "Managing committee member with review rights", isSystemAdmin: false },
      ];

      rolesList = await db
        .insert(societyRoles)
        .values(standardRoles.map((r) => ({ ...r, societyId: staff.societyId })))
        .returning();
    }

    return Response.json({ roles: rolesList });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/roles error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "staff.manage_roles");
    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { name, description } = parsed.data;

    // Check unique name within society
    const [existing] = await db
      .select({ id: societyRoles.id })
      .from(societyRoles)
      .where(and(eq(societyRoles.societyId, staff.societyId), eq(societyRoles.name, name.trim())))
      .limit(1);

    if (existing) {
      return Response.json({ error: `Role '${name}' already exists in your society` }, { status: 409 });
    }

    const [newRole] = await db
      .insert(societyRoles)
      .values({
        societyId: staff.societyId,
        name: name.trim(),
        description: description?.trim() || null,
        isSystemAdmin: false,
      })
      .returning();

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "role.create",
      entityType: "society_roles",
      entityId: newRole.id,
      metadata: { name: newRole.name },
    });

    return Response.json({ success: true, role: newRole }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/roles error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
