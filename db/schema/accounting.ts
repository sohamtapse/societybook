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
import { flats, societyBankAccounts } from "./society";
import { users } from "./auth";

// ============================================================
// ACCOUNTING ENGINE MODULE (Double-Entry + Subledger Dimensions)
// ============================================================

export const financialYears = pgTable(
  "financial_years",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 32 }).notNull(), // e.g., 2026-27
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("open"), // open | closing | closed
    isCurrent: boolean("is_current").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("financial_years_society_id_id_uq").on(table.societyId, table.id),
    uniqueIndex("financial_years_society_label_uq").on(table.societyId, table.label),
    index("financial_years_society_idx").on(table.societyId),
    check("financial_years_date_order_chk", sql`${table.startDate} < ${table.endDate}`),
  ]
);

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    financialYearId: uuid("financial_year_id").notNull(),
    periodNumber: integer("period_number").notNull(), // 1..12
    name: varchar("name", { length: 64 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isLocked: boolean("is_locked").notNull().default(false),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByUserId: uuid("locked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    unique("accounting_periods_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "accounting_periods_fy_fk",
    }).onDelete("cascade"),
    uniqueIndex("accounting_periods_society_fy_num_uq").on(
      table.societyId,
      table.financialYearId,
      table.periodNumber
    ),
    index("accounting_periods_society_idx").on(table.societyId),
  ]
);

export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    accountType: varchar("account_type", { length: 32 }).notNull(), // asset | liability | equity | income | expense
    parentAccountId: uuid("parent_account_id"),
    isGroup: boolean("is_group").notNull().default(false),
    // Subledger control account flags
    requiresFlat: boolean("requires_flat").notNull().default(false),
    requiresVendor: boolean("requires_vendor").notNull().default(false),
    requiresFund: boolean("requires_fund").notNull().default(false),
    isSystemAccount: boolean("is_system_account").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("chart_of_accounts_society_id_id_uq").on(table.societyId, table.id),
    uniqueIndex("chart_of_accounts_society_code_uq").on(table.societyId, table.code),
    index("chart_of_accounts_society_idx").on(table.societyId),
  ]
);

export const societyFunds = pgTable(
  "society_funds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(), // e.g., Sinking Fund, Repairs & Maintenance Fund, Reserve Fund
    fundType: varchar("fund_type", { length: 64 }).notNull(), // sinking | repairs | reserve | other
    controlAccountId: uuid("control_account_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("society_funds_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.controlAccountId],
      foreignColumns: [chartOfAccounts.societyId, chartOfAccounts.id],
      name: "society_funds_control_account_fk",
    }).onDelete("set null"),
    uniqueIndex("society_funds_society_code_uq").on(table.societyId, table.code),
    index("society_funds_society_idx").on(table.societyId),
  ]
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    contactPerson: varchar("contact_person", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    gstin: varchar("gstin", { length: 32 }),
    pan: varchar("pan", { length: 16 }),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("vendors_society_id_id_uq").on(table.societyId, table.id),
    uniqueIndex("vendors_society_code_uq").on(table.societyId, table.code),
    index("vendors_society_idx").on(table.societyId),
  ]
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    financialYearId: uuid("financial_year_id").notNull(),
    accountingPeriodId: uuid("accounting_period_id").notNull(),
    voucherSeries: varchar("voucher_series", { length: 16 }).notNull().default("JV"),
    voucherNumber: varchar("voucher_number", { length: 64 }).notNull(),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    sourceType: varchar("source_type", { length: 64 }).notNull(), // maintenance_demand | payment_receipt | bill | vendor_payment | fund_transaction | manual | year_closing | reversal
    sourceId: uuid("source_id"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("posted"), // draft | pending_approval | posted | reversed
    reversedEntryId: uuid("reversed_entry_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    postedAt: timestamp("posted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("journal_entries_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "journal_entries_fy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.accountingPeriodId],
      foreignColumns: [accountingPeriods.societyId, accountingPeriods.id],
      name: "journal_entries_period_fk",
    }).onDelete("restrict"),
    uniqueIndex("journal_entries_voucher_uq").on(
      table.societyId,
      table.financialYearId,
      table.voucherSeries,
      table.voucherNumber
    ),
    uniqueIndex("journal_entries_idempotency_uq").on(
      table.societyId,
      table.idempotencyKey
    ),
    index("journal_entries_society_date_idx").on(table.societyId, table.entryDate),
    index("journal_entries_society_source_idx").on(
      table.societyId,
      table.sourceType,
      table.sourceId
    ),
  ]
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    journalEntryId: uuid("journal_entry_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    accountId: uuid("account_id").notNull(),
    entryDate: date("entry_date").notNull(),
    debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0.00"),
    credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0.00"),
    narration: text("narration"),
    // Subledger dimension columns (derived flat/vendor/fund ledgers)
    flatId: uuid("flat_id"),
    vendorId: uuid("vendor_id"),
    fundId: uuid("fund_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.journalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "journal_lines_entry_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.accountId],
      foreignColumns: [chartOfAccounts.societyId, chartOfAccounts.id],
      name: "journal_lines_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "journal_lines_flat_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.vendorId],
      foreignColumns: [vendors.societyId, vendors.id],
      name: "journal_lines_vendor_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.fundId],
      foreignColumns: [societyFunds.societyId, societyFunds.id],
      name: "journal_lines_fund_fk",
    }).onDelete("restrict"),
    uniqueIndex("journal_lines_entry_line_uq").on(
      table.societyId,
      table.journalEntryId,
      table.lineNumber
    ),
    index("journal_lines_society_account_date_idx").on(
      table.societyId,
      table.accountId,
      table.entryDate
    ),
    index("journal_lines_society_flat_idx").on(
      table.societyId,
      table.flatId,
      table.accountId,
      table.entryDate
    ),
    index("journal_lines_society_vendor_idx").on(
      table.societyId,
      table.vendorId,
      table.accountId,
      table.entryDate
    ),
    index("journal_lines_society_fund_idx").on(
      table.societyId,
      table.fundId,
      table.accountId,
      table.entryDate
    ),
    check(
      "journal_lines_nonnegative_chk",
      sql`${table.debit} >= 0 AND ${table.credit} >= 0`
    ),
    check(
      "journal_lines_single_side_chk",
      sql`NOT (${table.debit} > 0 AND ${table.credit} > 0)`
    ),
    check(
      "journal_lines_nonzero_chk",
      sql`${table.debit} > 0 OR ${table.credit} > 0`
    ),
  ]
);

export const fundTransactions = pgTable(
  "fund_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    fundId: uuid("fund_id").notNull(),
    transactionType: varchar("transaction_type", { length: 32 }).notNull(), // contribution | utilization | transfer
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    description: text("description"),
    journalEntryId: uuid("journal_entry_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.fundId],
      foreignColumns: [societyFunds.societyId, societyFunds.id],
      name: "fund_transactions_fund_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.journalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "fund_transactions_journal_fk",
    }).onDelete("restrict"),
    index("fund_transactions_society_fund_idx").on(table.societyId, table.fundId),
    check("fund_transactions_amount_pos_chk", sql`${table.amount} > 0`),
  ]
);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id").notNull(),
    expenseAccountId: uuid("expense_account_id").notNull(),
    billNumber: varchar("bill_number", { length: 64 }).notNull(),
    billDate: date("bill_date").notNull(),
    dueDate: date("due_date"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | pending_approval | approved | paid | cancelled
    description: text("description"),
    journalEntryId: uuid("journal_entry_id"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("bills_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.vendorId],
      foreignColumns: [vendors.societyId, vendors.id],
      name: "bills_vendor_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.expenseAccountId],
      foreignColumns: [chartOfAccounts.societyId, chartOfAccounts.id],
      name: "bills_expense_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.journalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "bills_journal_fk",
    }).onDelete("restrict"),
    uniqueIndex("bills_society_vendor_number_uq").on(
      table.societyId,
      table.vendorId,
      table.billNumber
    ),
    index("bills_society_status_idx").on(table.societyId, table.status),
    check(
      "bills_amounts_chk",
      sql`${table.amount} >= 0 AND ${table.taxAmount} >= 0 AND ${table.totalAmount} > 0`
    ),
  ]
);

export const bankStatementImports = pgTable(
  "bank_statement_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    bankAccountId: uuid("bank_account_id").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileObjectKey: text("file_object_key"),
    statementFromDate: date("statement_from_date").notNull(),
    statementToDate: date("statement_to_date").notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }),
    closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }),
    importedByUserId: uuid("imported_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("bank_statement_imports_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.bankAccountId],
      foreignColumns: [societyBankAccounts.societyId, societyBankAccounts.id],
      name: "bank_statement_imports_bank_fk",
    }).onDelete("restrict"),
    index("bank_statement_imports_society_idx").on(table.societyId),
  ]
);

export const bankStatementTransactions = pgTable(
  "bank_statement_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    importId: uuid("import_id").notNull(),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    referenceNumber: varchar("reference_number", { length: 128 }),
    debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0.00"),
    credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0.00"),
    balance: numeric("balance", { precision: 14, scale: 2 }),
    matchStatus: varchar("match_status", { length: 32 }).notNull().default("unmatched"), // unmatched | matched | ambiguous | ignored
    matchedJournalEntryId: uuid("matched_journal_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.importId],
      foreignColumns: [bankStatementImports.societyId, bankStatementImports.id],
      name: "bank_stmt_txns_import_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.societyId, table.matchedJournalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "bank_stmt_txns_journal_fk",
    }).onDelete("set null"),
    index("bank_stmt_txns_society_import_idx").on(table.societyId, table.importId),
    check(
      "bank_stmt_txns_nonneg_chk",
      sql`${table.debit} >= 0 AND ${table.credit} >= 0`
    ),
  ]
);

export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    bankAccountId: uuid("bank_account_id").notNull(),
    importId: uuid("import_id"),
    asOfDate: date("as_of_date").notNull(),
    statementClosingBalance: numeric("statement_closing_balance", {
      precision: 14,
      scale: 2,
    }).notNull(),
    bookClosingBalance: numeric("book_closing_balance", {
      precision: 14,
      scale: 2,
    }).notNull(),
    reconcilingDifference: numeric("reconciling_difference", {
      precision: 14,
      scale: 2,
    }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | approved
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.bankAccountId],
      foreignColumns: [societyBankAccounts.societyId, societyBankAccounts.id],
      name: "bank_reconciliations_bank_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.importId],
      foreignColumns: [bankStatementImports.societyId, bankStatementImports.id],
      name: "bank_reconciliations_import_fk",
    }).onDelete("set null"),
    index("bank_reconciliations_society_idx").on(table.societyId, table.asOfDate),
  ]
);

export const yearClosings = pgTable(
  "year_closings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    financialYearId: uuid("financial_year_id").notNull(),
    closingJournalEntryId: uuid("closing_journal_entry_id"),
    openingBalanceJournalEntryId: uuid("opening_balance_journal_entry_id"),
    status: varchar("status", { length: 32 }).notNull().default("completed"), // in_progress | completed
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "year_closings_fy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.closingJournalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "year_closings_closing_je_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.societyId, table.openingBalanceJournalEntryId],
      foreignColumns: [journalEntries.societyId, journalEntries.id],
      name: "year_closings_opening_je_fk",
    }).onDelete("restrict"),
    uniqueIndex("year_closings_society_fy_uq").on(
      table.societyId,
      table.financialYearId
    ),
  ]
);

