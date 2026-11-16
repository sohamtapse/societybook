import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { societies } from "./platform";
import { flats } from "./society";

// ============================================================
// AUTHENTICATION & AUTHORIZATION MODULE
// ============================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    passwordHash: text("password_hash").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"), // active | suspended | disabled
    credentialVersion: integer("credential_version").notNull().default(1),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)]
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 128 }).notNull(), // e.g., accounting.view, maintenance.generate
    module: varchar("module", { length: 64 }).notNull(),
    description: text("description"),
  },
  (table) => [uniqueIndex("permissions_code_uq").on(table.code)]
);

export const societyRoles = pgTable(
  "society_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    isSystemAdmin: boolean("is_system_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("society_roles_society_id_id_uq").on(table.societyId, table.id),
    uniqueIndex("society_roles_society_name_uq").on(table.societyId, table.name),
    index("society_roles_society_idx").on(table.societyId),
  ]
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.roleId],
      foreignColumns: [societyRoles.societyId, societyRoles.id],
      name: "role_permissions_society_role_fk",
    }).onDelete("cascade"),
    uniqueIndex("role_permissions_role_perm_uq").on(table.roleId, table.permissionId),
    index("role_permissions_society_idx").on(table.societyId),
  ]
);

export const userSocietyRoles = pgTable(
  "user_society_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.roleId],
      foreignColumns: [societyRoles.societyId, societyRoles.id],
      name: "user_society_roles_society_role_fk",
    }).onDelete("cascade"),
    uniqueIndex("user_society_roles_user_society_role_uq").on(
      table.userId,
      table.societyId,
      table.roleId
    ),
    index("user_society_roles_society_idx").on(table.societyId, table.userId),
  ]
);

export const flatPortalAccounts = pgTable(
  "flat_portal_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    flatId: uuid("flat_id").notNull(),
    username: varchar("username", { length: 128 }).notNull(), // e.g., GREENVALLEY-A101
    passwordHash: text("password_hash").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"), // active | disabled
    credentialVersion: integer("credential_version").notNull().default(1),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("flat_portal_accounts_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "flat_portal_accounts_society_flat_fk",
    }).onDelete("cascade"),
    uniqueIndex("flat_portal_accounts_username_uq").on(table.username),
    uniqueIndex("flat_portal_accounts_society_flat_uq").on(table.societyId, table.flatId),
    index("flat_portal_accounts_society_idx").on(table.societyId),
  ]
);

export const residentSessions = pgTable(
  "resident_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    flatPortalAccountId: uuid("flat_portal_account_id").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    credentialVersion: integer("credential_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.flatPortalAccountId],
      foreignColumns: [flatPortalAccounts.societyId, flatPortalAccounts.id],
      name: "resident_sessions_account_fk",
    }).onDelete("cascade"),
    index("resident_sessions_society_account_idx").on(
      table.societyId,
      table.flatPortalAccountId
    ),
  ]
);

export const credentialResetLogs = pgTable(
  "credential_reset_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    flatPortalAccountId: uuid("flat_portal_account_id").notNull(),
    resetByUserId: uuid("reset_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 32 }).notNull(), // provisioned | reset | disabled | reactivated
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.flatPortalAccountId],
      foreignColumns: [flatPortalAccounts.societyId, flatPortalAccounts.id],
      name: "credential_reset_logs_account_fk",
    }).onDelete("cascade"),
    index("credential_reset_logs_society_idx").on(table.societyId, table.createdAt),
  ]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountType: varchar("account_type", { length: 32 }).notNull(), // platform | staff | resident
    identifier: varchar("identifier", { length: 255 }).notNull(), // email or username
    ipAddress: varchar("ip_address", { length: 64 }),
    succeeded: boolean("succeeded").notNull(),
    failureReason: varchar("failure_reason", { length: 128 }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("login_attempts_identifier_time_idx").on(
      table.accountType,
      table.identifier,
      table.attemptedAt
    ),
  ]
);

