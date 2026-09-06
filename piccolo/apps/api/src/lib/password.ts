import argon2 from "argon2";

// A short denylist of the passwords that show up first in every breach
// corpus. This is not a substitute for length, it just closes the most
// embarrassing gap length alone leaves open.
const COMMON_PASSWORDS = new Set([
  "password123456", "123456789012", "qwertyuiop123", "letmein12345",
  "welcome123456", "administrator", "changeme12345", "password1234",
]);

export function assessPasswordStrength(password: string, email: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common.";
  const localPart = email.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length > 3 && password.toLowerCase().includes(localPart)) {
    return "Password must not contain your email address.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
