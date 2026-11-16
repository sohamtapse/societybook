import { requireAuth } from "@/lib/auth/context";

export async function GET() {
  try {
    const user = await requireAuth();
    return Response.json({ user });
  } catch {
    return Response.json({ user: null }, { status: 401 });
  }
}

