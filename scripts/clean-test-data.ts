import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { db } from "../db";
import { sql } from "drizzle-orm";

async function clean() {
  console.log("Cleaning test data...");
  const deletedFlats = await db.execute(
    sql`DELETE FROM flats WHERE society_id IN (SELECT id FROM societies WHERE code LIKE 'TEST_SOC_%') RETURNING id;`
  );
  const deletedRoles = await db.execute(
    sql`DELETE FROM society_roles WHERE society_id IN (SELECT id FROM societies WHERE code LIKE 'TEST_SOC_%') RETURNING id;`
  );
  const deletedLimits = await db.execute(
    sql`DELETE FROM society_limits WHERE society_id IN (SELECT id FROM societies WHERE code LIKE 'TEST_SOC_%') RETURNING id;`
  );
  const deletedSocieties = await db.execute(
    sql`DELETE FROM societies WHERE code LIKE 'TEST_SOC_%' RETURNING code;`
  );
  const deletedUsers = await db.execute(
    sql`DELETE FROM users WHERE email LIKE '%@test.internal' RETURNING email;`
  );

  console.log("Deleted test societies:", deletedSocieties.rows);
  console.log("Deleted test users:", deletedUsers.rows);
  console.log("Cleanup complete!");
  process.exit(0);
}

clean().catch((err) => {
  console.error(err);
  process.exit(1);
});
