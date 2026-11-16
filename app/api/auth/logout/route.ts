import { clearAuthCookies } from "@/lib/auth/cookies";

export async function POST() {
  await clearAuthCookies();
  return Response.json({ success: true, message: "Logged out successfully" });
}
