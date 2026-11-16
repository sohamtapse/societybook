import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformUsers, users, userSocietyRoles, societyRoles } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";
import { logPlatformAction, logSocietyAction } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  accountType: z.enum(["platform", "staff"]).default("staff"),
  societyId: z.string().uuid().optional(), // Needed if staff belongs to multiple societies
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email, password, accountType, societyId } = parsed.data;

    if (accountType === "platform") {
      const [user] = await db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.email, email.toLowerCase().trim()))
        .limit(1);

      if (!user) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }

      if (user.status !== "active") {
        return Response.json({ error: "Platform account is inactive" }, { status: 403 });
      }

      const isValid = await verifyPassword(user.passwordHash, password);
      if (!isValid) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }

      // Update lastLoginAt
      await db
        .update(platformUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(platformUsers.id, user.id));

      const tokenPayload = {
        sub: user.id,
        accountType: "platform" as const,
        email: user.email,
        credentialVersion: user.credentialVersion,
      };

      const accessToken = await signAccessToken(tokenPayload);
      const refreshToken = await signRefreshToken(tokenPayload);

      await setAuthCookies(accessToken, refreshToken);
      await logPlatformAction({
        platformUserId: user.id,
        action: "platform.login",
        entityType: "platform_users",
        entityId: user.id,
      });

      return Response.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          accountType: "platform",
        },
      });
    }

    // Staff Login
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.status !== "active") {
      return Response.json({ error: "User account is suspended or disabled" }, { status: 403 });
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Find user's societies
    const userSocieties = await db
      .select({
        societyId: userSocietyRoles.societyId,
        roleId: userSocietyRoles.roleId,
        roleName: societyRoles.name,
      })
      .from(userSocietyRoles)
      .innerJoin(societyRoles, eq(societyRoles.id, userSocietyRoles.roleId))
      .where(eq(userSocietyRoles.userId, user.id));

    if (userSocieties.length === 0) {
      return Response.json(
        { error: "No active society membership found for this user" },
        { status: 403 }
      );
    }

    const activeSociety = societyId
      ? userSocieties.find((s) => s.societyId === societyId)
      : userSocieties[0];

    if (!activeSociety) {
      return Response.json(
        {
          error: "User is not a member of the specified society",
          availableSocieties: userSocieties.map((s) => s.societyId),
        },
        { status: 403 }
      );
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const tokenPayload = {
      sub: user.id,
      accountType: "staff" as const,
      email: user.email,
      societyId: activeSociety.societyId,
      credentialVersion: user.credentialVersion,
    };

    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    await setAuthCookies(accessToken, refreshToken);
    await logSocietyAction({
      societyId: activeSociety.societyId,
      actorType: "staff",
      actorId: user.id,
      action: "staff.login",
      entityType: "users",
      entityId: user.id,
    });

    return Response.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        societyId: activeSociety.societyId,
        accountType: "staff",
      },
    });
  } catch (error) {
    console.error("Login route error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
