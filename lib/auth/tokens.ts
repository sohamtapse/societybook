import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export type AccountType = "platform" | "staff" | "resident";

export interface TokenUserPayload {
  sub: string; // userId or flatPortalAccountId
  accountType: AccountType;
  email?: string;
  societyId?: string; // Tenant context (for staff & resident)
  flatId?: string; // Specific flat ID (for resident)
  credentialVersion: number;
  roles?: string[]; // Platform role code or Society role IDs
}

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "7d";

export async function signAccessToken(payload: TokenUserPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer("societybook")
    .setAudience("societybook-app")
    .sign(ACCESS_SECRET);
}

export async function signRefreshToken(payload: TokenUserPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer("societybook")
    .setAudience("societybook-app")
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token: string): Promise<TokenUserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET, {
      issuer: "societybook",
      audience: "societybook-app",
    });
    return payload as unknown as TokenUserPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<TokenUserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET, {
      issuer: "societybook",
      audience: "societybook-app",
    });
    return payload as unknown as TokenUserPayload;
  } catch {
    return null;
  }
}

