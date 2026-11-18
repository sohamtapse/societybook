import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { residents, flatOccupancies, flats } from "@/db/schema";
import { requireSocietyStaff, AuthorizationError, AuthenticationError } from "@/lib/auth/context";
import { logSocietyAction } from "@/lib/audit";

const createResidentSchema = z.object({
  fullName: z.string().min(2).max(255),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().min(10).max(32).optional().nullable(),
  alternatePhone: z.string().max(32).optional().nullable(),
  kycReference: z.string().max(128).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    let query = db
      .select({
        id: residents.id,
        societyId: residents.societyId,
        fullName: residents.fullName,
        email: residents.email,
        phone: residents.phone,
        alternatePhone: residents.alternatePhone,
        kycReference: residents.kycReference,
        isActive: residents.isActive,
        createdAt: residents.createdAt,
      })
      .from(residents)
      .where(
        q
          ? and(
              eq(residents.societyId, staff.societyId),
              or(
                ilike(residents.fullName, `%${q}%`),
                ilike(residents.phone, `%${q}%`),
                ilike(residents.email, `%${q}%`)
              )
            )
          : eq(residents.societyId, staff.societyId)
      )
      .orderBy(residents.fullName);

    const list = await query;
    return Response.json({ residents: list });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("GET /api/admin/residents error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireSocietyStaff(undefined, "residents.create");
    const body = await request.json();
    const parsed = createResidentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const [newResident] = await db
      .insert(residents)
      .values({
        societyId: staff.societyId,
        fullName: data.fullName.trim(),
        email: data.email?.trim().toLowerCase() || null,
        phone: data.phone?.trim() || null,
        alternatePhone: data.alternatePhone?.trim() || null,
        kycReference: data.kycReference?.trim() || null,
        isActive: true,
      })
      .returning();

    await logSocietyAction({
      societyId: staff.societyId,
      actorType: "staff",
      actorId: staff.id,
      action: "resident.create",
      entityType: "residents",
      entityId: newResident.id,
      metadata: { fullName: newResident.fullName, phone: newResident.phone },
    });

    return Response.json({ success: true, resident: newResident }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
    console.error("POST /api/admin/residents error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
