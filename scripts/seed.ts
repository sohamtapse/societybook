import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { db } from "../db";
import {
  platformUsers,
  platformRoles,
  platformUserRoles,
  plans,
  permissions,
} from "../db/schema";
import { hashPassword } from "../lib/auth/password";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding initial platform foundation...");

  // 1. Seed Permissions Catalog
  const corePermissions = [
    { code: "flats.view", module: "flats", description: "View flats and occupancy" },
    { code: "flats.create", module: "flats", description: "Create flats" },
    { code: "flats.update", module: "flats", description: "Update flats" },
    { code: "residents.credentials.reset", module: "residents", description: "Reset resident flat portal credentials" },
    { code: "maintenance.generate", module: "maintenance", description: "Generate monthly maintenance demands" },
    { code: "maintenance.collect", module: "maintenance", description: "Record and approve payments" },
    { code: "maintenance.view_all", module: "maintenance", description: "View maintenance demands and payments" },
    { code: "accounting.view", module: "accounting", description: "View chart of accounts and general ledger" },
    { code: "accounting.create_entry", module: "accounting", description: "Create journal entries" },
    { code: "accounting.approve_entry", module: "accounting", description: "Approve maker-checker journal entries" },
    { code: "accounting.view_balance_sheet", module: "accounting", description: "View balance sheet and financial reports" },
    { code: "complaints.assign", module: "complaints", description: "Assign complaints to staff" },
    { code: "complaints.resolve", module: "complaints", description: "Resolve complaints" },
    { code: "reports.export", module: "reports", description: "Export audit and statutory reports" },
  ];

  for (const perm of corePermissions) {
    const [existing] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, perm.code))
      .limit(1);

    if (!existing) {
      await db.insert(permissions).values(perm);
    }
  }
  console.log("✓ Core permissions verified");

  // 2. Seed Default SaaS Plans
  const defaultPlans = [
    {
      code: "starter",
      name: "Starter Society",
      description: "For small housing societies up to 50 flats",
      billingCycle: "monthly",
      priceInr: "999.00",
      maxFlatsDefault: 50,
      maxUsersDefault: 5,
    },
    {
      code: "growth",
      name: "Growth Society",
      description: "For medium housing societies up to 200 flats",
      billingCycle: "monthly",
      priceInr: "2499.00",
      maxFlatsDefault: 200,
      maxUsersDefault: 15,
    },
    {
      code: "enterprise",
      name: "Large Society / Complex",
      description: "For large cooperative complexes up to 1000 flats",
      billingCycle: "annual",
      priceInr: "24999.00",
      maxFlatsDefault: 1000,
      maxUsersDefault: 50,
    },
  ];

  for (const plan of defaultPlans) {
    const [existing] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, plan.code))
      .limit(1);

    if (!existing) {
      await db.insert(plans).values(plan);
    }
  }
  console.log("✓ SaaS subscription plans verified");

  // 3. Seed Platform Roles & Super Admin
  const [superAdminRole] = await db
    .insert(platformRoles)
    .values({
      code: "super_admin",
      name: "Platform Super Admin",
      description: "Full access to SaaS operations, societies, and billing",
    })
    .onConflictDoNothing()
    .returning();

  const superAdminEmail = "superadmin@societybook.internal";
  const [existingAdmin] = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(eq(platformUsers.email, superAdminEmail))
    .limit(1);

  if (!existingAdmin) {
    const pwdHash = await hashPassword("SuperAdmin@Secure2026!");
    const [adminUser] = await db
      .insert(platformUsers)
      .values({
        email: superAdminEmail,
        fullName: "Platform System Operator",
        passwordHash: pwdHash,
        status: "active",
      })
      .returning();

    if (superAdminRole) {
      await db.insert(platformUserRoles).values({
        platformUserId: adminUser.id,
        platformRoleId: superAdminRole.id,
      });
    }

    console.log("✓ Created initial Platform Super Admin:", superAdminEmail);
  } else {
    console.log("✓ Platform Super Admin already exists");
  }

  console.log("✨ Milestone 1 database seed completed successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
