import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { societies } from "./platform";
import { flats, societyPaymentMethods } from "./society";
import { users } from "./auth";
import {
  chartOfAccounts,
  financialYears,
  journalEntries,
} from "./accounting";

// ============================================================
// MAINTENANCE & SOCIETY PAYMENTS MODULE
// ============================================================

export const maintenanceHeads = pgTable(
  "maintenance_heads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    calculationMethod: varchar("calculation_method", { length: 32 }).notNull(), // fixed_per_flat | per_sqft | percentage
    defaultRate: numeric("default_rate", { precision: 14, scale: 2 }).notNull().default("0.00"),
    incomeAccountId: uuid("income_account_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("maintenance_heads_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.incomeAccountId],
      foreignColumns: [chartOfAccounts.societyId, chartOfAccounts.id],
      name: "maintenance_heads_income_account_fk",
    }).onDelete("restrict"),
    uniqueIndex("maintenance_heads_society_code_uq").on(table.societyId, table.code),
    index("maintenance_heads_society_idx").on(table.societyId),
    check("maintenance_heads_rate_nonneg_chk", sql`${table.defaultRate} >= 0`),
  ]
);

export const maintenanceDemands = pgTable(
  "maintenance_demands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    flatId: uuid("flat_id").notNull(),
    financialYearId: uuid("financial_year_id").notNull(),
    demandNumber: varchar("demand_number", { length: 64 }).notNull(),
    billingMonth: integer("billing_month").notNull(), // 1..12
    billingYear: integer("billing_year").notNull(),
    billDate: date("bill_date").notNull(),
    dueDate: date("due_date").notNull(),
    principalAmount: numeric("principal_amount", { precision: 14, scale: 2 }).notNull(),
    interestAmount: numeric("interest_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("posted"), // draft | posted | partially_paid | paid | cancelled
    journalEntryId: uuid("journal_entry_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("maintenance_demands_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "maintenance_demands_flat_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "maintenance_demands_fy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.journalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "maintenance_demands_journal_fk",
    }).onDelete("restrict"),
    uniqueIndex("maintenance_demands_number_uq").on(
      table.societyId,
      table.financialYearId,
      table.demandNumber
    ),
    index("maintenance_demands_society_flat_idx").on(table.societyId, table.flatId),
    check(
      "maintenance_demands_amounts_chk",
      sql`${table.principalAmount} >= 0 AND ${table.interestAmount} >= 0 AND ${table.totalAmount} >= 0`
    ),
  ]
);

export const maintenanceDemandItems = pgTable(
  "maintenance_demand_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    demandId: uuid("demand_id").notNull(),
    headId: uuid("head_id").notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.demandId],
      foreignColumns: [maintenanceDemands.societyId, maintenanceDemands.id],
      name: "maintenance_demand_items_demand_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.societyId, table.headId],
      foreignColumns: [maintenanceHeads.societyId, maintenanceHeads.id],
      name: "maintenance_demand_items_head_fk",
    }).onDelete("restrict"),
    index("maintenance_demand_items_society_demand_idx").on(
      table.societyId,
      table.demandId
    ),
    check("maintenance_demand_items_amount_chk", sql`${table.amount} >= 0`),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    flatId: uuid("flat_id").notNull(),
    paymentMethodId: uuid("payment_method_id"),
    paymentMode: varchar("payment_mode", { length: 32 }).notNull(), // upi_qr | bank_transfer | cash | cheque
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    utrReference: varchar("utr_reference", { length: 128 }),
    proofObjectKey: text("proof_object_key"),
    remarks: text("remarks"),
    submittedByType: varchar("submitted_by_type", { length: 32 }).notNull(), // resident | staff
    submittedById: uuid("submitted_by_id"),
    status: varchar("status", { length: 32 }).notNull().default("pending_verification"), // pending_verification | approved | rejected | reversed
    journalEntryId: uuid("journal_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("payments_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "payments_flat_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.paymentMethodId],
      foreignColumns: [societyPaymentMethods.societyId, societyPaymentMethods.id],
      name: "payments_method_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.societyId, table.journalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "payments_journal_fk",
    }).onDelete("restrict"),
    index("payments_society_status_idx").on(table.societyId, table.status),
    index("payments_society_flat_idx").on(table.societyId, table.flatId),
    check("payments_amount_pos_chk", sql`${table.amount} > 0`),
  ]
);

export const paymentVerifications = pgTable(
  "payment_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").notNull(),
    decision: varchar("decision", { length: 32 }).notNull(), // approved | rejected
    verifiedByUserId: uuid("verified_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.paymentId],
      foreignColumns: [payments.societyId, payments.id],
      name: "payment_verifications_payment_fk",
    }).onDelete("restrict"),
    index("payment_verifications_society_payment_idx").on(
      table.societyId,
      table.paymentId
    ),
  ]
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").notNull(),
    demandId: uuid("demand_id").notNull(),
    allocatedAmount: numeric("allocated_amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.paymentId],
      foreignColumns: [payments.societyId, payments.id],
      name: "payment_allocations_payment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.demandId],
      foreignColumns: [maintenanceDemands.societyId, maintenanceDemands.id],
      name: "payment_allocations_demand_fk",
    }).onDelete("restrict"),
    index("payment_allocations_society_payment_idx").on(
      table.societyId,
      table.paymentId
    ),
    check("payment_allocations_amount_pos_chk", sql`${table.allocatedAmount} > 0`),
  ]
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    financialYearId: uuid("financial_year_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    flatId: uuid("flat_id").notNull(),
    receiptSeries: varchar("receipt_series", { length: 16 }).notNull().default("REC"),
    receiptNumber: varchar("receipt_number", { length: 64 }).notNull(),
    receiptDate: date("receipt_date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "receipts_fy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.paymentId],
      foreignColumns: [payments.societyId, payments.id],
      name: "receipts_payment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "receipts_flat_fk",
    }).onDelete("restrict"),
    uniqueIndex("receipts_number_uq").on(
      table.societyId,
      table.financialYearId,
      table.receiptSeries,
      table.receiptNumber
    ),
    uniqueIndex("receipts_payment_uq").on(table.societyId, table.paymentId),
    index("receipts_society_flat_idx").on(table.societyId, table.flatId),
    check("receipts_amount_pos_chk", sql`${table.amount} > 0`),
  ]
);

export const paymentAdjustments = pgTable(
  "payment_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    flatId: uuid("flat_id").notNull(),
    adjustmentType: varchar("adjustment_type", { length: 16 }).notNull(), // credit | debit
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    journalEntryId: uuid("journal_entry_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "payment_adjustments_flat_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.journalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "payment_adjustments_journal_fk",
    }).onDelete("restrict"),
    index("payment_adjustments_society_flat_idx").on(table.societyId, table.flatId),
    check("payment_adjustments_amount_pos_chk", sql`${table.amount} > 0`),
  ]
);

