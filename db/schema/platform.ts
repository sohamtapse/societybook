import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// PLATFORM MODULE (SaaS Operator, Societies, Plans, Billing)
// ============================================================

export const platformUsers = pgTable(
  "platform_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"), // active | suspended | disabled
    credentialVersion: integer("credential_version").notNull().default(1),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("platform_users_email_uq").on(table.email)]
);

export const platformRoles = pgTable(
  "platform_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("platform_roles_code_uq").on(table.code)]
);

export const platformUserRoles = pgTable(
  "platform_user_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platformUserId: uuid("platform_user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    platformRoleId: uuid("platform_role_id")
      .notNull()
      .references(() => platformRoles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("platform_user_roles_user_role_uq").on(
      table.platformUserId,
      table.platformRoleId
    ),
  ]
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    billingCycle: varchar("billing_cycle", { length: 32 }).notNull().default("monthly"), // monthly | annual
    priceInr: numeric("price_inr", { precision: 14, scale: 2 }).notNull(),
    maxFlatsDefault: integer("max_flats_default").notNull(),
    maxUsersDefault: integer("max_users_default").notNull(),
    featuresJson: jsonb("features_json").$type<Record<string, boolean>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("plans_code_uq").on(table.code),
    check("plans_price_nonnegative_chk", sql`${table.priceInr} >= 0`),
    check("plans_limits_positive_chk", sql`${table.maxFlatsDefault} > 0 AND ${table.maxUsersDefault} > 0`),
  ]
);

export const societies = pgTable(
  "societies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(), // e.g., GREENVALLEY (used in flat username generation)
    name: varchar("name", { length: 255 }).notNull(),
    registrationNumber: varchar("registration_number", { length: 128 }),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: varchar("city", { length: 128 }),
    state: varchar("state", { length: 128 }).default("Maharashtra"),
    pincode: varchar("pincode", { length: 16 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    status: varchar("status", { length: 32 }).notNull().default("active"), // active | suspended | archived
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("societies_code_uq").on(table.code)]
);

export const societyLimits = pgTable(
  "society_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    maxFlats: integer("max_flats").notNull(),
    maxUsers: integer("max_users").notNull(),
    updatedByPlatformUserId: uuid("updated_by_platform_user_id").references(
      () => platformUsers.id,
      { onDelete: "set null" }
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("society_limits_society_uq").on(table.societyId),
    check("society_limits_positive_chk", sql`${table.maxFlats} > 0 AND ${table.maxUsers} > 0`),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 32 }).notNull().default("active"), // trialing | active | past_due | expired | cancelled
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    autoRenew: boolean("auto_renew").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("subscriptions_society_status_idx").on(table.societyId, table.status),
  ]
);

export const subscriptionInvoices = pgTable(
  "subscription_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    amountInr: numeric("amount_inr", { precision: 14, scale: 2 }).notNull(),
    taxInr: numeric("tax_inr", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalInr: numeric("total_inr", { precision: 14, scale: 2 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("unpaid"), // unpaid | paid | failed | void
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("subscription_invoices_number_uq").on(table.invoiceNumber),
    index("subscription_invoices_society_idx").on(table.societyId),
    check(
      "subscription_invoices_amounts_chk",
      sql`${table.amountInr} >= 0 AND ${table.taxInr} >= 0 AND ${table.totalInr} >= 0`
    ),
  ]
);

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => subscriptionInvoices.id, { onDelete: "restrict" }),
    gatewayName: varchar("gateway_name", { length: 64 }).notNull(),
    gatewayOrderId: varchar("gateway_order_id", { length: 128 }),
    gatewayPaymentId: varchar("gateway_payment_id", { length: 128 }),
    amountInr: numeric("amount_inr", { precision: 14, scale: 2 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"), // pending | captured | failed | refunded
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("subscription_payments_idempotency_uq").on(table.idempotencyKey),
    index("subscription_payments_society_idx").on(table.societyId),
    check("subscription_payments_amount_chk", sql`${table.amountInr} > 0`),
  ]
);

export const subscriptionWebhooks = pgTable(
  "subscription_webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gatewayName: varchar("gateway_name", { length: 64 }).notNull(),
    eventId: varchar("event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("subscription_webhooks_gateway_event_uq").on(
      table.gatewayName,
      table.eventId
    ),
  ]
);

export const platformAuditLogs = pgTable(
  "platform_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platformUserId: uuid("platform_user_id").references(() => platformUsers.id, {
      onDelete: "set null",
    }),
    societyId: uuid("society_id").references(() => societies.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id"),
    metadataJson: jsonb("metadata_json"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("platform_audit_logs_society_idx").on(table.societyId, table.createdAt),
  ]
);

