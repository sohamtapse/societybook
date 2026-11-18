import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { societyRoles, rolePermissions, permissions } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const updatePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const staff = await requireSocietyStaff();
    const { roleId } = await params;

    // Verify role belongs to staff's society
    const [roleRecord] = await db
      .select()
      .from(societyRoles)
      .where(and(eq(societyRoles.id, roleId), eq(societyRoles.societyId, staff.societyId)))
      .limit(1);

    if (!roleRecord) {
      return Response.json({ error: "Role not found in your society" }, { status: 404 });
    }

    // Fetch all catalog permissions
    const allPermissions = await db
      .select({
        id: permissions.id,
        code: permissions.code,
        module: permissions.module,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(permissions.module, permissions.code);

    // Fetch currently assigned permission IDs for this role
    const assigned = await db
      .select({
        permissionId: rolePermissions.permissionId,
      })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.societyId, staff.societyId)
        )
      );

    const assignedIds = assigned.map((a) => a.permissionId);

    return Response.json({
      role: roleRecord,
      permissions: allPermissions,
      assignedPermissionIds: assignedIds,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/roles/[roleId]/permissions error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const staff = await requireSocietyStaff(undefined, "staff.manage_roles");
    const { roleId } = await params;
    const body = await request.json();
    const parsed = updatePermissionsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { permissionIds } = parsed.data;

    // Verify role belongs to staff's society
    const [roleRecord] = await db
      .select()
      .from(societyRoles)
      .where(and(eq(societyRoles.id, roleId), eq(societyRoles.societyId, staff.societyId)))
      .limit(1);

    if (!roleRecord) {
      return Response.json({ error: "Role not found in your society" }, { status: 404 });
    }

    // Replace assigned permissions atomically
    await db.transaction(async (tx) => {
      // 1. Delete existing assignments
      await tx
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.societyId, staff.societyId)
          )
        );

      // 2. Insert new assignments if any
      if (permissionIds.length > 0) {
        await tx.insert(rolePermissions).values(
          permissionIds.map((pId) => ({
            societyId: staff.societyId,
            roleId,
            permissionId: pId,
          }))
        );
      }
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "role.update_permissions",
      entityType: "society_roles",
      entityId: roleId,
      metadata: { roleName: roleRecord.name, permissionCount: permissionIds.length },
    });

    return Response.json({ success: true, message: "Role permissions updated successfully" });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("PUT /api/admin/roles/[roleId]/permissions error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
