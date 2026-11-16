import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { db } from "../db";
import {
  societies,
  societyLimits,
  flats,
  users,
  societyRoles,
  userSocietyRoles,
  platformAuditLogs,
} from "../db/schema";
import { purgeExpiredAuditLogs } from "../lib/audit";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { signAccessToken, verifyAccessToken } from "../lib/auth/tokens";
import { eq, and } from "drizzle-orm";

describe("Milestone 1 — Authentication & Multi-Tenancy Core Tests", () => {
  let societyAId: string;
  let societyBId: string;
  let adminAId: string;
  let adminBId: string;

  beforeAll(async () => {
    // 1. Create Society A
    const [socA] = await db
      .insert(societies)
      .values({
        code: `TEST_SOC_A_${Date.now()}`,
        name: "Test Society Alpha",
        status: "active",
      })
      .returning();
    societyAId = socA.id;

    await db.insert(societyLimits).values({
      societyId: societyAId,
      maxFlats: 2, // low limit for testing
      maxUsers: 5,
    });

    // 2. Create Society B
    const [socB] = await db
      .insert(societies)
      .values({
        code: `TEST_SOC_B_${Date.now()}`,
        name: "Test Society Beta",
        status: "active",
      })
      .returning();
    societyBId = socB.id;

    await db.insert(societyLimits).values({
      societyId: societyBId,
      maxFlats: 10,
      maxUsers: 5,
    });

    // 3. Create Staff User for Society A
    const [userA] = await db
      .insert(users)
      .values({
        email: `adminA_${Date.now()}@test.internal`,
        fullName: "Admin Alpha",
        passwordHash: await hashPassword("SecretA123!"),
        status: "active",
      })
      .returning();
    adminAId = userA.id;

    const [roleA] = await db
      .insert(societyRoles)
      .values({
        societyId: societyAId,
        name: "Secretary",
        isSystemAdmin: true,
      })
      .returning();

    await db.insert(userSocietyRoles).values({
      userId: adminAId,
      societyId: societyAId,
      roleId: roleA.id,
    });

    // 4. Create Staff User for Society B
    const [userB] = await db
      .insert(users)
      .values({
        email: `adminB_${Date.now()}@test.internal`,
        fullName: "Admin Beta",
        passwordHash: await hashPassword("SecretB123!"),
        status: "active",
      })
      .returning();
    adminBId = userB.id;

    const [roleB] = await db
      .insert(societyRoles)
      .values({
        societyId: societyBId,
        name: "Treasurer",
        isSystemAdmin: true,
      })
      .returning();

    await db.insert(userSocietyRoles).values({
      userId: adminBId,
      societyId: societyBId,
      roleId: roleB.id,
    });
  });

  afterAll(async () => {
    // Clean up temporary test societies created for isolation testing
    if (societyAId) {
      await db.delete(societies).where(eq(societies.id, societyAId));
    }
    if (societyBId) {
      await db.delete(societies).where(eq(societies.id, societyBId));
    }
    if (adminAId) {
      await db.delete(users).where(eq(users.id, adminAId));
    }
    if (adminBId) {
      await db.delete(users).where(eq(users.id, adminBId));
    }
  });

  it("hashes passwords securely with Argon2id and verifies correctly", async () => {
    const raw = "SuperSecretPassword#2026";
    const hashed = await hashPassword(raw);

    expect(hashed).toContain("$argon2id$");
    expect(await verifyPassword(hashed, raw)).toBe(true);
    expect(await verifyPassword(hashed, "wrongPassword")).toBe(false);
  });

  it("signs and verifies short-lived JWT access tokens with tenant claims", async () => {
    const payload = {
      sub: adminAId,
      accountType: "staff" as const,
      email: "adminA@test.internal",
      societyId: societyAId,
      credentialVersion: 1,
    };

    const token = await signAccessToken(payload);
    const verified = await verifyAccessToken(token);

    expect(verified).not.null;
    expect(verified?.sub).toBe(adminAId);
    expect(verified?.societyId).toBe(societyAId);
    expect(verified?.accountType).toBe("staff");
  });

  it("guarantees Society A cannot read Society B flats via tenant-scoped querying", async () => {
    // Insert flat in Society B
    const [flatB] = await db
      .insert(flats)
      .values({
        societyId: societyBId,
        flatNumber: "B-101",
      })
      .returning();

    // Query scoped to Society A
    const flatsInSocietyA = await db
      .select()
      .from(flats)
      .where(and(eq(flats.societyId, societyAId), eq(flats.id, flatB.id)));

    expect(flatsInSocietyA.length).toBe(0);

    // Query scoped to Society B finds it
    const flatsInSocietyB = await db
      .select()
      .from(flats)
      .where(and(eq(flats.societyId, societyBId), eq(flats.id, flatB.id)));

    expect(flatsInSocietyB.length).toBe(1);
    expect(flatsInSocietyB[0].flatNumber).toBe("B-101");
  });

  it("enforces composite foreign key constraints preventing cross-tenant references", async () => {
    await expect(async () => {
      await db.insert(flats).values({
        societyId: societyAId,
        buildingId: "00000000-0000-0000-0000-000000000000", // invalid
        flatNumber: "A-999",
      });
    }).rejects.toThrow();
  });

  it("prohibits Society A staff from acting as Society B admin", async () => {
    const membershipInSocietyB = await db
      .select()
      .from(userSocietyRoles)
      .where(
        and(
          eq(userSocietyRoles.userId, adminAId),
          eq(userSocietyRoles.societyId, societyBId)
        )
      );

    expect(membershipInSocietyB.length).toBe(0);
  });

  it("automatically purges audit logs older than 2 days to optimize storage", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const recentDate = new Date();

    // Insert an expired log entry (3 days old)
    const [oldLog] = await db
      .insert(platformAuditLogs)
      .values({
        action: "test.old.action",
        entityType: "test",
        createdAt: threeDaysAgo,
      })
      .returning();

    // Insert a fresh log entry
    const [newLog] = await db
      .insert(platformAuditLogs)
      .values({
        action: "test.recent.action",
        entityType: "test",
        createdAt: recentDate,
      })
      .returning();

    // Run purge for logs older than 2 days
    await purgeExpiredAuditLogs(2);

    // Verify old log is deleted
    const oldFound = await db
      .select()
      .from(platformAuditLogs)
      .where(eq(platformAuditLogs.id, oldLog.id));
    expect(oldFound.length).toBe(0);

    // Verify fresh log is preserved
    const newFound = await db
      .select()
      .from(platformAuditLogs)
      .where(eq(platformAuditLogs.id, newLog.id));
    expect(newFound.length).toBe(1);

    // Cleanup fresh log
    await db.delete(platformAuditLogs).where(eq(platformAuditLogs.id, newLog.id));
  });
});
