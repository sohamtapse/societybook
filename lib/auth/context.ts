import { cookies, headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  platformUsers,
  users,
  flatPortalAccounts,
  userSocietyRoles,
  rolePermissions,
  permissions,
} from "@/db/schema";
import {
  verifyAccessToken,
  TokenUserPayload,
  AccountType,
} from "./tokens";
import { ACCESS_COOKIE_NAME } from "./cookies";

export interface AuthenticatedUser {
  id: string;
  accountType: AccountType;
  email?: string;
  societyId?: string;
  flatId?: string;
  credentialVersion: number;
  permissions?: Set<string>;
}

export class AuthenticationError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Extracts and verifies the access token from Authorization header or HTTP-only cookie.
 */
export async function getVerifiedTokenPayload(): Promise<TokenUserPayload | null> {
  const reqHeaders = await headers();
  const authHeader = reqHeaders.get("authorization");

  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(ACCESS_COOKIE_NAME)?.value ?? null;
  }

  if (!token) {
    return null;
  }

  return verifyAccessToken(token);
}

/**
 * Enforces authentication and validates that the account is active and credential version matches DB.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const payload = await getVerifiedTokenPayload();
  if (!payload) {
    throw new AuthenticationError("Missing or invalid authentication token");
  }

  if (payload.accountType === "platform") {
    const [pUser] = await db
      .select({
        id: platformUsers.id,
        email: platformUsers.email,
        status: platformUsers.status,
        credentialVersion: platformUsers.credentialVersion,
      })
      .from(platformUsers)
      .where(eq(platformUsers.id, payload.sub))
      .limit(1);

    if (!pUser || pUser.status !== "active") {
      throw new AuthenticationError("Platform account is inactive or not found");
    }

    if (pUser.credentialVersion !== payload.credentialVersion) {
      throw new AuthenticationError("Credentials have been revoked. Please re-login");
    }

    return {
      id: pUser.id,
      accountType: "platform",
      email: pUser.email,
      credentialVersion: pUser.credentialVersion,
    };
  }

  if (payload.accountType === "staff") {
    if (!payload.societyId) {
      throw new AuthorizationError("Staff token must include a society context");
    }

    const [u] = await db
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        credentialVersion: users.credentialVersion,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!u || u.status !== "active") {
      throw new AuthenticationError("User account is inactive or not found");
    }

    if (u.credentialVersion !== payload.credentialVersion) {
      throw new AuthenticationError("Credentials have been revoked. Please re-login");
    }

    // Load active society permissions
    const activeRoles = await db
      .select({
        permissionCode: permissions.code,
      })
      .from(userSocietyRoles)
      .innerJoin(
        rolePermissions,
        and(
          eq(rolePermissions.roleId, userSocietyRoles.roleId),
          eq(rolePermissions.societyId, userSocietyRoles.societyId)
        )
      )
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userSocietyRoles.userId, u.id),
          eq(userSocietyRoles.societyId, payload.societyId),
          eq(userSocietyRoles.isActive, true)
        )
      );

    const userPerms = new Set<string>(activeRoles.map((r) => r.permissionCode));

    return {
      id: u.id,
      accountType: "staff",
      email: u.email,
      societyId: payload.societyId,
      credentialVersion: u.credentialVersion,
      permissions: userPerms,
    };
  }

  if (payload.accountType === "resident") {
    const [flatAccount] = await db
      .select({
        id: flatPortalAccounts.id,
        societyId: flatPortalAccounts.societyId,
        flatId: flatPortalAccounts.flatId,
        status: flatPortalAccounts.status,
        credentialVersion: flatPortalAccounts.credentialVersion,
      })
      .from(flatPortalAccounts)
      .where(eq(flatPortalAccounts.id, payload.sub))
      .limit(1);

    if (!flatAccount || flatAccount.status !== "active") {
      throw new AuthenticationError("Flat portal account is disabled or not found");
    }

    if (flatAccount.credentialVersion !== payload.credentialVersion) {
      throw new AuthenticationError("Portal credentials have been reset. Please re-login");
    }

    return {
      id: flatAccount.id,
      accountType: "resident",
      societyId: flatAccount.societyId,
      flatId: flatAccount.flatId,
      credentialVersion: flatAccount.credentialVersion,
    };
  }

  throw new AuthenticationError("Unknown account type");
}

/**
 * Enforces Platform Super Admin access only.
 */
export async function requirePlatformAdmin(): Promise<AuthenticatedUser> {
  const auth = await requireAuth();
  if (auth.accountType !== "platform") {
    throw new AuthorizationError("Platform Super Admin access required");
  }
  return auth;
}

/**
 * Enforces Society Staff access and verifies tenant boundary.
 * Never trust societyId sent from browser.
 */
export async function requireSocietyStaff(
  targetSocietyId?: string,
  requiredPermission?: string
): Promise<AuthenticatedUser & { societyId: string }> {
  const auth = await requireAuth();
  if (auth.accountType !== "staff" || !auth.societyId) {
    throw new AuthorizationError("Society staff access required");
  }

  if (targetSocietyId && auth.societyId !== targetSocietyId) {
    throw new AuthorizationError("Cross-tenant access prohibited");
  }

  if (requiredPermission && !auth.permissions?.has(requiredPermission)) {
    throw new AuthorizationError(`Missing required permission: ${requiredPermission}`);
  }

  return auth as AuthenticatedUser & { societyId: string };
}

/**
 * Enforces Resident access for their own allocated flat.
 */
export async function requireResident(
  targetSocietyId?: string,
  targetFlatId?: string
): Promise<AuthenticatedUser & { societyId: string; flatId: string }> {
  const auth = await requireAuth();
  if (auth.accountType !== "resident" || !auth.societyId || !auth.flatId) {
    throw new AuthorizationError("Resident portal access required");
  }

  if (targetSocietyId && auth.societyId !== targetSocietyId) {
    throw new AuthorizationError("Cross-tenant access prohibited");
  }

  if (targetFlatId && auth.flatId !== targetFlatId) {
    throw new AuthorizationError("Access denied for this flat");
  }

  return auth as AuthenticatedUser & { societyId: string; flatId: string };
}

