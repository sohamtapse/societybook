import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { societies } from "./platform";
import { flats } from "./society";
import { users } from "./auth";

// ============================================================
// COMPLAINTS, NOTICES & DOCUMENTS MODULE
// ============================================================

export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    flatId: uuid("flat_id"),
    category: varchar("category", { length: 64 }).notNull(),
    priority: varchar("priority", { length: 32 }).notNull().default("medium"), // low | medium | high | urgent
    status: varchar("status", { length: 32 }).notNull().default("open"), // open | in_progress | resolved | closed
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("complaints_society_id_id_uq").on(table.societyId, table.id),
    foreignKey({
      columns: [table.societyId, table.flatId],
      foreignColumns: [flats.societyId, flats.id],
      name: "complaints_flat_fk",
    }).onDelete("set null"),
    index("complaints_society_status_idx").on(table.societyId, table.status),
  ]
);

export const complaintComments = pgTable(
  "complaint_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    complaintId: uuid("complaint_id").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.societyId, table.complaintId],
      foreignColumns: [complaints.societyId, complaints.id],
      name: "complaint_comments_complaint_fk",
    }).onDelete("cascade"),
    index("complaint_comments_society_complaint_idx").on(
      table.societyId,
      table.complaintId
    ),
  ]
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 64 }).notNull(), // payment | bill | complaint | notice | audit_observation
    entityId: uuid("entity_id").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    objectKey: text("object_key").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("attachments_society_entity_idx").on(
      table.societyId,
      table.entityType,
      table.entityId
    ),
  ]
);

export const notices = pgTable(
  "notices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    audience: varchar("audience", { length: 32 }).notNull().default("all"), // all | owners | tenants | staff
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("notices_society_published_idx").on(table.societyId, table.isPublished)]
);

