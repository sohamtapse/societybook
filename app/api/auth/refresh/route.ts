import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformUsers, users, flatPortalAccounts } from "@/db/schema";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE_NAME } from "@/lib/auth/cookies";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(REFRESH_COOKIE_NAME)?.value;

    if (!token) {
      return Response.json({ error: "Missing refresh token" }, { status: 401 });
    }

    const payload = await verifyRefreshToken(token);
    if (!payload) {
      await clearAuthCookies();
      return Response.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    let credentialVersion = 0;

    if (payload.accountType === "platform") {
      const [u] = await db
        .select({ status: platformUsers.status, credentialVersion: platformUsers.credentialVersion })
        .from(platformUsers)
        .where(eq(platformUsers.id, payload.sub))
        .limit(1);

      if (!u || u.status !== "active" || u.credentialVersion !== payload.credentialVersion) {
        await clearAuthCookies();
        return Response.json({ error: "Session revoked or account inactive" }, { status: 403 });
      }
      credentialVersion = u.credentialVersion;
    } else if (payload.accountType === "staff") {
      const [u] = await db
        .select({ status: users.status, credentialVersion: users.credentialVersion })
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!u || u.status !== "active" || u.credentialVersion !== payload.credentialVersion) {
        await clearAuthCookies();
        return Response.json({ error: "Session revoked or account inactive" }, { status: 403 });
      }
      credentialVersion = u.credentialVersion;
    } else if (payload.accountType === "resident") {
      const [u] = await db
        .select({ status: flatPortalAccounts.status, credentialVersion: flatPortalAccounts.credentialVersion })
        .from(flatPortalAccounts)
        .where(eq(flatPortalAccounts.id, payload.sub))
        .limit(1);

      if (!u || u.status !== "active" || u.credentialVersion !== payload.credentialVersion) {
        await clearAuthCookies();
        return Response.json({ error: "Session revoked or account inactive" }, { status: 403 });
      }
      credentialVersion = u.credentialVersion;
    }

    // Rotate tokens
    const nextPayload = {
      sub: payload.sub,
      accountType: payload.accountType,
      email: payload.email,
      societyId: payload.societyId,
      flatId: payload.flatId,
      credentialVersion,
    };

    const newAccessToken = await signAccessToken(nextPayload);
    const newRefreshToken = await signRefreshToken(nextPayload);

    await setAuthCookies(newAccessToken, newRefreshToken);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Refresh route error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
