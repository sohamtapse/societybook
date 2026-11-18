import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/db";
import { users, userSocietyRoles, societyRoles, societyLimits } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { hashPassword } from "@/lib/auth/password";
import { generateSecureTemporaryPassword } from "@/lib/services/provisioning";
import { logSocietyAction } from "@/lib/audit";

const addStaffSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()),
  fullName: z.string().min(2).max(255),
  phone: z.string().min(10).max(32).optional().nullable(),
  roleId: z.string().uuid(),
});

export async function GET(_request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();

    const staffMembers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        roleId: societyRoles.id,
        roleName: societyRoles.name,
        roleIsAdmin: societyRoles.isSystemAdmin,
        isActive: userSocietyRoles.isActive,
        assignedAt: userSocietyRoles.assignedAt,
      })
      .from(userSocietyRoles)
      .innerJoin(users, eq(users.id, userSocietyRoles.userId))
      .innerJoin(societyRoles, and(eq(societyRoles.id, userSocietyRoles.roleId), eq(societyRoles.societyId, staff.societyId)))
      .where(eq(userSocietyRoles.societyId, staff.societyId))
      .orderBy(users.fullName);

    return Response.json({ staff: staffMembers });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/staff error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "staff.manage");
    const body = await request.json();
    const parsed = addStaffSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify role belongs to staff's society
    const [roleRecord] = await db
      .select()
      .from(societyRoles)
      .where(and(eq(societyRoles.id, data.roleId), eq(societyRoles.societyId, staff.societyId)))
      .limit(1);

    if (!roleRecord) {
      return Response.json({ error: "Role not found in your society" }, { status: 404 });
    }

    const result = await db.transaction(async (tx) => {
      // 1. Enforce maxUsers limit
      const [limitRecord] = await tx
        .select({ maxUsers: societyLimits.maxUsers })
        .from(societyLimits)
        .where(eq(societyLimits.societyId, staff.societyId))
        .limit(1);

      const maxAllowed = limitRecord?.maxUsers ?? 10;

      const [existingUsersCount] = await tx
        .select({ count: count() })
        .from(userSocietyRoles)
        .where(eq(userSocietyRoles.societyId, staff.societyId));

      if ((existingUsersCount?.count ?? 0) >= maxAllowed) {
        throw new Error(`SOCIETY_USER_LIMIT_REACHED: Staff user limit of ${maxAllowed} reached`);
      }

      // 2. Check if user already exists
      let [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      let temporaryPassword: string | null = null;

      if (!existingUser) {
        temporaryPassword = generateSecureTemporaryPassword(12);
        const passwordHash = await hashPassword(temporaryPassword);

        [existingUser] = await tx
          .insert(users)
          .values({
            email: data.email,
            fullName: data.fullName.trim(),
            phone: data.phone?.trim() || null,
            passwordHash,
            status: "active",
          })
          .returning();
      }

      // 3. Check if already has a role in this society
      const [existingAssignment] = await tx
        .select()
        .from(userSocietyRoles)
        .where(
          and(
            eq(userSocietyRoles.userId, existingUser.id),
            eq(userSocietyRoles.societyId, staff.societyId)
          )
        )
        .limit(1);

      if (existingAssignment) {
        throw new Error("ALREADY_ASSIGNED: User already has an assigned role in this society");
      }

      // 4. Assign role
      const [assignment] = await tx
        .insert(userSocietyRoles)
        .values({
          userId: existingUser.id,
          societyId: staff.societyId,
          roleId: data.roleId,
          isActive: true,
        })
        .returning();

      return {
        user: existingUser,
        role: roleRecord,
        assignment,
        temporaryPassword,
      };
    });

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "staff.assign_role",
      entityType: "user_society_roles",
      entityId: result.assignment.id,
      metadata: {
        userEmail: result.user.email,
        roleName: result.role.name,
      },
    });

    return Response.json(
      {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.role.name,
        },
        temporaryPassword: result.temporaryPassword, // Provided only once if user was newly created
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SOCIETY_USER_LIMIT_REACHED")) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message.startsWith("ALREADY_ASSIGNED")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/staff error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
