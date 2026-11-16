import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing parameters adhering to OWASP recommendations:
 * - memoryCost: 19456 KiB (19 MiB)
 * - timeCost: 2 iterations
 * - parallelism: 1 thread
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(plainText: string): Promise<string> {
  return hash(plainText, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hashedPassword: string,
  plainText: string
): Promise<boolean> {
  try {
    return await verify(hashedPassword, plainText);
  } catch {
    return false;
  }
}

