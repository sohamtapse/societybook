import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { societies } from "./platform";
import { users } from "./auth";
import { financialYears } from "./accounting";

// ============================================================
// AUDIT & COMPLIANCE MODULE
// ============================================================

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    actorType: varchar("actor_type", { length: 32 }).notNull(), // staff | resident | system
    actorId: uuid("actor_id"),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id"),
    metadataJson: jsonb("metadata_json"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_society_created_idx").on(table.societyId, table.createdAt),
    index("audit_logs_society_entity_idx").on(
      table.societyId,
      table.entityType,
      table.entityId
    ),
  ]
);

export const auditSessions = pgTable(
  "audit_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    financialYearId: uuid("financial_year_id").notNull(),
    auditorUserId: uuid("auditor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    auditorName: varchar("auditor_name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("in_progress"), // in_progress | submitted | closed
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("audit_sessions_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "audit_sessions_fy_fk",
    }).onDelete("restrict"),
    index("audit_sessions_society_idx").on(table.societyId, table.financialYearId),
  ]
);

export const auditObservations = pgTable(
  "audit_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "restrict" }),
    auditSessionId: uuid("audit_session_id").notNull(),
    severity: varchar("severity", { length: 32 }).notNull().default("medium"), // low | medium | high | critical
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    rectificationStatus: varchar("rectification_status", { length: 32 })
      .notNull()
      .default("open"), // open | in_review | rectified
    rectificationNotes: text("rectification_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.auditSessionId],
      foreignColumns: [auditSessions.societyId, auditSessions.id],
      name: "audit_observations_session_fk",
    }).onDelete("cascade"),
    index("audit_observations_society_session_idx").on(
      table.societyId,
      table.auditSessionId
    ),
  ]
);

export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    financialYearId: uuid("financial_year_id").notNull(),
    reportType: varchar("report_type", { length: 64 }).notNull(),
    parametersJson: jsonb("parameters_json"),
    snapshotJson: jsonb("snapshot_json").notNull(),
    generatedByUserId: uuid("generated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.financialYearId],
      foreignColumns: [financialYears.societyId, financialYears.id],
      name: "report_snapshots_fy_fk",
    }).onDelete("restrict"),
    index("report_snapshots_society_type_idx").on(table.societyId, table.reportType),
  ]
);

