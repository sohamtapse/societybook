import { sql } from "drizzle-orm";
import { db } from "@/db";
import { storage } from "@/lib/storage";

export async function GET() {
  const checks: {
    postgres: { ok: boolean; result?: unknown; error?: string };
    objectStorage: { ok: boolean; bucket: string; error?: string };
  } = {
    postgres: { ok: false },
    objectStorage: { ok: false, bucket: process.env.STORAGE_BUCKET || "assets" },
  };

  try {
    const res = await db.execute(sql`SELECT 1 AS ok`);
    checks.postgres = { ok: true, result: res.rows?.[0] ?? { ok: 1 } };
  } catch (err) {
    checks.postgres = {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown Postgres error",
    };
  }

  const probeKey = `_health/probe-${Date.now()}.txt`;
  try {
    await storage.upload(probeKey, "ok", { contentType: "text/plain" });
    const exists = await storage.exists(probeKey);
    const downloaded = await storage.download(probeKey);
    const text = await downloaded.text();
    await storage.delete(probeKey);

    checks.objectStorage = {
      ok: exists && text === "ok",
      bucket: process.env.STORAGE_BUCKET || "assets",
    };
  } catch (err) {
    checks.objectStorage = {
      ok: false,
      bucket: process.env.STORAGE_BUCKET || "assets",
      error: err instanceof Error ? err.message : "Unknown Object Storage error",
    };
  }

  const allOk = checks.postgres.ok && checks.objectStorage.ok;

  return Response.json(
    {
      status: allOk ? "ok" : "degraded",
      service: "societybook",
      branch: process.env.NEON_BRANCH || null,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 500 }
  );
}
