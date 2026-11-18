import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  flatPortalAccounts,
  flats,
  societies,
  residentSessions,
  loginAttempts,
} from "@/db/schema";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";

const residentLoginSchema = z.object({
  username: z.string().min(3).max(128),
  password: z.string().min(1).max(255),
});

export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    const body = await request.json();
    const parsed = residentLoginSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;
    const normalizedUsername = username.trim().toUpperCase();

    // 1. Query flat portal account joined with flat and society
    const [record] = await db
      .select({
        accountId: flatPortalAccounts.id,
        societyId: flatPortalAccounts.societyId,
        flatId: flatPortalAccounts.flatId,
        username: flatPortalAccounts.username,
        passwordHash: flatPortalAccounts.passwordHash,
        status: flatPortalAccounts.status,
        credentialVersion: flatPortalAccounts.credentialVersion,
        flatNumber: flats.flatNumber,
        societyName: societies.name,
        societyCode: societies.code,
        societyStatus: societies.status,
      })
      .from(flatPortalAccounts)
      .innerJoin(flats, eq(flats.id, flatPortalAccounts.flatId))
      .innerJoin(societies, eq(societies.id, flatPortalAccounts.societyId))
      .where(eq(flatPortalAccounts.username, normalizedUsername))
      .limit(1);

    if (!record) {
      await db.insert(loginAttempts).values({
        accountType: "resident",
        identifier: normalizedUsername,
        ipAddress,
        succeeded: false,
        failureReason: "account_not_found",
      });
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // 2. Check society status
    if (record.societyStatus !== "active") {
      await db.insert(loginAttempts).values({
        accountType: "resident",
        identifier: normalizedUsername,
        ipAddress,
        succeeded: false,
        failureReason: "society_inactive",
      });
      return Response.json(
        { error: `Society is currently ${record.societyStatus}. Access disabled.` },
        { status: 403 }
      );
    }

    // 3. Check portal account status
    if (record.status !== "active") {
      await db.insert(loginAttempts).values({
        accountType: "resident",
        identifier: normalizedUsername,
        ipAddress,
        succeeded: false,
        failureReason: "account_disabled",
      });
      return Response.json(
        { error: "Resident portal account has been disabled by society admin" },
        { status: 403 }
      );
    }

    // 4. Verify password with Argon2id
    const passwordValid = await verifyPassword(record.passwordHash, password);
    if (!passwordValid) {
      await db.insert(loginAttempts).values({
        accountType: "resident",
        identifier: normalizedUsername,
        ipAddress,
        succeeded: false,
        failureReason: "invalid_password",
      });
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // 5. Generate dual JWT tokens with resident claims
    const tokenPayload = {
      sub: record.accountId,
      accountType: "resident" as const,
      societyId: record.societyId,
      flatId: record.flatId,
      credentialVersion: record.credentialVersion,
    };

    const accessToken = await signAccessToken(tokenPayload);
    const refreshToken = await signRefreshToken(tokenPayload);

    // 6. Record session in residentSessions
    const hashedRefreshToken = await hashPassword(refreshToken);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await tx.insert(residentSessions).values({
        societyId: record.societyId,
        flatPortalAccountId: record.accountId,
        refreshTokenHash: hashedRefreshToken,
        credentialVersion: record.credentialVersion,
        expiresAt: sessionExpiresAt,
        ipAddress,
        userAgent,
      });

      await tx
        .update(flatPortalAccounts)
        .set({ lastLoginAt: new Date() })
        .where(eq(flatPortalAccounts.id, record.accountId));
    });

    // 7. Log successful attempt
    await db.insert(loginAttempts).values({
      accountType: "resident",
      identifier: normalizedUsername,
      ipAddress,
      succeeded: true,
    });

    // 8. Set HttpOnly secure cookies
    await setAuthCookies(accessToken, refreshToken);

    return Response.json({
      success: true,
      resident: {
        username: record.username,
        flatNumber: record.flatNumber,
        societyName: record.societyName,
        societyCode: record.societyCode,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/resident-login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
