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

// ============================================================
// SOCIETY & RESIDENTS MODULE
// ============================================================

export const societySettings = pgTable(
  "society_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    financialYearStartMonth: integer("financial_year_start_month").notNull().default(4), // April 1
    financialYearStartDay: integer("financial_year_start_day").notNull().default(1),
    currencyCode: varchar("currency_code", { length: 8 }).notNull().default("INR"),
    overdueInterestRateAnnual: numeric("overdue_interest_rate_annual", {
      precision: 6,
      scale: 2,
    })
      .notNull()
      .default("0.00"),
    receiptPrefix: varchar("receipt_prefix", { length: 16 }).notNull().default("REC"),
    voucherPrefix: varchar("voucher_prefix", { length: 16 }).notNull().default("JV"),
    residentComplaintsVisible: boolean("resident_complaints_visible").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("society_settings_society_uq").on(table.societyId),
    check(
      "society_settings_interest_nonneg_chk",
      sql`${table.overdueInterestRateAnnual} >= 0`
    ),
  ]
);

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("buildings_society_id_id_uq").on(table.societyId, table.id),
    uniqueIndex("buildings_society_code_uq").on(table.societyId, table.code),
    index("buildings_society_idx").on(table.societyId),
  ]
);

export const wings = pgTable(
  "wings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("wings_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.buildingId],
      foreignColumns: [buildings.societyId, buildings.id],
      name: "wings_society_building_fk",
    }).onDelete("cascade"),
    uniqueIndex("wings_society_building_code_uq").on(
      table.societyId,
      table.buildingId,
      table.code
    ),
    index("wings_society_idx").on(table.societyId),
  ]
);

export const flats = pgTable(
  "flats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id"),
    wingId: uuid("wing_id"),
    flatNumber: varchar("flat_number", { length: 32 }).notNull(),
    floorNumber: integer("floor_number"),
    areaSqFt: numeric("area_sq_ft", { precision: 10, scale: 2 }),
    flatType: varchar("flat_type", { length: 32 }).default("residential"), // residential | commercial
    status: varchar("status", { length: 32 }).notNull().default("occupied"), // occupied | vacant | under_renovation
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("flats_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.buildingId],
      foreignColumns: [buildings.societyId, buildings.id],
      name: "flats_society_building_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.societyId, table.wingId],
      foreignColumns: [wings.societyId, wings.id],
      name: "flats_society_wing_fk",
    }).onDelete("set null"),
    uniqueIndex("flats_society_building_wing_number_uq").on(
      table.societyId,
      table.buildingId,
      table.wingId,
      table.flatNumber
    ),
    index("flats_society_idx").on(table.societyId),
    check("flats_area_positive_chk", sql`${table.areaSqFt} IS NULL OR ${table.areaSqFt} > 0`),
  ]
);

export const residents = pgTable(
  "residents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    alternatePhone: varchar("alternate_phone", { length: 32 }),
    kycReference: varchar("kyc_reference", { length: 128 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("residents_society_id_id_uq").on(table.societyId, table.id),
    index("residents_society_idx").on(table.societyId),
  ]
);

export const flatOccupancies = pgTable(
  "flat_occupancies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    flatId: uuid("flat_id").notNull(),
    residentId: uuid("resident_id").notNull(),
    occupancyType: varchar("occupancy_type", { length: 32 }).notNull(), // primary_owner | co_owner | tenant | family_member
    isPrimary: boolean("is_primary").notNull().default(false),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "flat_occupancies_society_flat_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.societyId, table.residentId],
      foreignColumns: [residents.societyId, residents.id],
      name: "flat_occupancies_society_resident_fk",
    }).onDelete("cascade"),
    index("flat_occupancies_society_flat_idx").on(table.societyId, table.flatId),
    index("flat_occupancies_society_resident_idx").on(table.societyId, table.residentId),
  ]
);

export const societyBankAccounts = pgTable(
  "society_bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    bankName: varchar("bank_name", { length: 128 }).notNull(),
    branchName: varchar("branch_name", { length: 128 }),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountNumberMasked: varchar("account_number_masked", { length: 64 }).notNull(),
    ifscCode: varchar("ifsc_code", { length: 16 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("society_bank_accounts_society_id_id_uq").on(table.societyId, table.id),
    index("society_bank_accounts_society_idx").on(table.societyId),
  ]
);

export const societyPaymentMethods = pgTable(
  "society_payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    methodType: varchar("method_type", { length: 32 }).notNull(), // upi_qr | bank_transfer | cash
    label: varchar("label", { length: 128 }).notNull(),
    upiId: varchar("upi_id", { length: 128 }),
    qrImageObjectKey: text("qr_image_object_key"),
    bankAccountId: uuid("bank_account_id"),
    instructions: text("instructions"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("society_payment_methods_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.bankAccountId],
      foreignColumns: [societyBankAccounts.societyId, societyBankAccounts.id],
      name: "society_payment_methods_bank_fk",
    }).onDelete("set null"),
    index("society_payment_methods_society_idx").on(table.societyId),
  ]
);

