import { db } from "@/db";
import { platformAuditLogs, auditLogs } from "@/db/schema";
import { lt } from "drizzle-orm";

/**
 * Purge audit logs older than the specified retention window (default: 2 days)
 * to keep database storage footprint lightweight.
 */
export async function purgeExpiredAuditLogs(retentionDays: number = 2) {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Remove expired platform audit entries
    await db
      .delete(platformAuditLogs)
      .where(lt(platformAuditLogs.createdAt, cutoffDate));

    // Remove expired tenant/society audit entries
    await db
      .delete(auditLogs)
      .where(lt(auditLogs.createdAt, cutoffDate));
  } catch (error) {
    console.error("Failed to purge expired audit logs:", error);
  }
}

export async function logPlatformAction(params: {
  platformUserId?: string;
  societyId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(platformAuditLogs).values({
      platformUserId: params.platformUserId,
      societyId: params.societyId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadataJson: params.metadata,
      ipAddress: params.ipAddress,
    });
  } catch (error) {
    console.error("Failed to log platform action:", error);
  }
}

export async function logSocietyAction(params: {
  societyId: string;
  actorType: "staff" | "resident" | "system";
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      societyId: params.societyId,
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadataJson: params.metadata,
      ipAddress: params.ipAddress,
    });
  } catch (error) {
    console.error("Failed to log society action:", error);
  }
}

