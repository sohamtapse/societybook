import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { db } from "../db";
import { platformUsers, platformRoles, platformUserRoles } from "../db/schema";
import { hashPassword } from "../lib/auth/password";
import { eq } from "drizzle-orm";

/**
 * Standalone Super Admin Seeder
 * Run: npx tsx scripts/seed-superadmin.ts
 */
async function seedSuperAdmin() {
  console.log("⚡ Checking/Seeding Platform Super Admin...");

  const adminEmail = process.env.SUPERADMIN_EMAIL || "superadmin@societybook.internal";
  const adminPassword = process.env.SUPERADMIN_PASSWORD || "SuperAdmin@Secure2026!";

  // 1. Ensure 'super_admin' role exists
  let [role] = await db
    .select()
    .from(platformRoles)
    .where(eq(platformRoles.code, "super_admin"))
    .limit(1);

  if (!role) {
    [role] = await db
      .insert(platformRoles)
      .values({
        code: "super_admin",
        name: "Platform Super Admin",
        description: "Full master access to platform governance and societies",
      })
      .returning();
    console.log("✓ Created platform role: super_admin");
  }

  // 2. Ensure superadmin user exists
  const [existingUser] = await db
    .select()
    .from(platformUsers)
    .where(eq(platformUsers.email, adminEmail))
    .limit(1);

  if (!existingUser) {
    const passwordHash = await hashPassword(adminPassword);
    const [newUser] = await db
      .insert(platformUsers)
      .values({
        email: adminEmail,
        fullName: "Platform Super Admin",
        passwordHash,
        status: "active",
      })
      .returning();

    await db.insert(platformUserRoles).values({
      platformUserId: newUser.id,
      platformRoleId: role.id,
    });

    console.log("✓ Created Super Admin user successfully:");
  } else {
    // Reset password to guarantee testing works
    const passwordHash = await hashPassword(adminPassword);
    await db
      .update(platformUsers)
      .set({
        passwordHash,
        status: "active",
        credentialVersion: existingUser.credentialVersion + 1,
      })
      .where(eq(platformUsers.id, existingUser.id));

    console.log("✓ Super Admin credentials synchronized:");
  }

  console.log("-----------------------------------------");
  console.log(`URL:      http://localhost:3000/platform-login`);
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log("-----------------------------------------");
}

seedSuperAdmin()
  .catch((err) => {
    console.error("Super Admin seed error:", err);
    process.exit(1);
  });
