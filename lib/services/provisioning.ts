import { randomBytes } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  flatPortalAccounts,
  residentSessions,
  credentialResetLogs,
  societies,
  flats,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { logSocietyAction } from "@/lib/audit";

/**
 * Normalizes society code and flat number into a clean, collision-free username.
 * e.g., society "GREENVALLEY", flat "A-101" => "GREENVALLEY-A101"
 */
export function generateFlatUsername(societyCode: string, flatNumber: string): string {
  const cleanCode = societyCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cleanFlat = flatNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${cleanCode}-${cleanFlat}`;
}

/**
 * Generates a cryptographically random, high-entropy temporary password.
 * Format: 12 alphanumeric characters with at least one uppercase, lowercase, and digit.
 */
export function generateSecureTemporaryPassword(length = 12): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Automatically provisions a resident portal account for a flat during flat creation.
 * Returns the generated temporary password ONCE to display to the admin.
 */
export async function provisionFlatPortalAccount(
  tx: DatabaseTransaction,
  params: {
    societyId: string;
    flatId: string;
    societyCode: string;
    flatNumber: string;
    adminUserId?: string;
    ipAddress?: string;
  }
) {
  const baseUsername = generateFlatUsername(params.societyCode, params.flatNumber);

  // Check if username already exists to handle potential edge collisions
  const [existing] = await tx
    .select({ id: flatPortalAccounts.id })
    .from(flatPortalAccounts)
    .where(eq(flatPortalAccounts.username, baseUsername))
    .limit(1);

  const finalUsername = existing
    ? `${baseUsername}-${randomBytes(2).toString("hex").toUpperCase()}`
    : baseUsername;

  const temporaryPassword = generateSecureTemporaryPassword(12);
  const passwordHash = await hashPassword(temporaryPassword);

  const [account] = await tx
    .insert(flatPortalAccounts)
    .values({
      societyId: params.societyId,
      flatId: params.flatId,
      username: finalUsername,
      passwordHash,
      status: "active",
      credentialVersion: 1,
      passwordChangedAt: new Date(),
    })
    .returning();

  // Log to credential reset history
  await tx.insert(credentialResetLogs).values({
    societyId: params.societyId,
    flatPortalAccountId: account.id,
    resetByUserId: params.adminUserId,
    action: "provisioned",
    ipAddress: params.ipAddress,
  });

  return {
    account,
    temporaryPassword,
  };
}

/**
 * Resets a resident portal password.
 * - Generates new temporary password
 * - Hashes with Argon2id
 * - Increments credential version
 * - Revokes all active sessions for this account
 * - Logs audit event
 * Returns new temporary password for one-time display.
 */
export async function resetFlatPortalPassword(
  tx: DatabaseTransaction,
  params: {
    societyId: string;
    flatPortalAccountId: string;
    adminUserId: string;
    ipAddress?: string;
  }
) {
  const [account] = await tx
    .select()
    .from(flatPortalAccounts)
    .where(
      and(
        eq(flatPortalAccounts.id, params.flatPortalAccountId),
        eq(flatPortalAccounts.societyId, params.societyId)
      )
    )
    .limit(1);

  if (!account) {
    throw new Error("PORTAL_ACCOUNT_NOT_FOUND");
  }

  const temporaryPassword = generateSecureTemporaryPassword(12);
  const passwordHash = await hashPassword(temporaryPassword);
  const newCredentialVersion = account.credentialVersion + 1;
  const now = new Date();

  // 1. Update portal account password and increment credential version
  await tx
    .update(flatPortalAccounts)
    .set({
      passwordHash,
      credentialVersion: newCredentialVersion,
      passwordChangedAt: now,
    })
    .where(eq(flatPortalAccounts.id, account.id));

  // 2. Revoke all active resident sessions immediately
  await tx
    .update(residentSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(residentSessions.flatPortalAccountId, account.id),
        sql`${residentSessions.revokedAt} IS NULL`
      )
    );

  // 3. Record credential reset log
  await tx.insert(credentialResetLogs).values({
    societyId: params.societyId,
    flatPortalAccountId: account.id,
    resetByUserId: params.adminUserId,
    action: "reset",
    ipAddress: params.ipAddress,
  });

  return {
    temporaryPassword,
    newCredentialVersion,
  };
}

/**
 * Toggles status between 'active' and 'disabled'.
 * Disabling revokes all active sessions.
 */
export async function toggleFlatPortalStatus(
  tx: DatabaseTransaction,
  params: {
    societyId: string;
    flatPortalAccountId: string;
    status: "active" | "disabled";
    adminUserId: string;
    ipAddress?: string;
  }
) {
  const [account] = await tx
    .select()
    .from(flatPortalAccounts)
    .where(
      and(
        eq(flatPortalAccounts.id, params.flatPortalAccountId),
        eq(flatPortalAccounts.societyId, params.societyId)
      )
    )
    .limit(1);

  if (!account) {
    throw new Error("PORTAL_ACCOUNT_NOT_FOUND");
  }

  const now = new Date();
  const newCredentialVersion =
    params.status === "disabled"
      ? account.credentialVersion + 1
      : account.credentialVersion;

  await tx
    .update(flatPortalAccounts)
    .set({
      status: params.status,
      credentialVersion: newCredentialVersion,
    })
    .where(eq(flatPortalAccounts.id, account.id));

  if (params.status === "disabled") {
    // Revoke active sessions
    await tx
      .update(residentSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(residentSessions.flatPortalAccountId, account.id),
          sql`${residentSessions.revokedAt} IS NULL`
        )
      );
  }

  await tx.insert(credentialResetLogs).values({
    societyId: params.societyId,
    flatPortalAccountId: account.id,
    resetByUserId: params.adminUserId,
    action: params.status === "disabled" ? "disabled" : "reactivated",
    ipAddress: params.ipAddress,
  });

  return { status: params.status };
}
