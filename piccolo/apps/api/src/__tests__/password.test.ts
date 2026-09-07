import { describe, it, expect } from "vitest";
import { assessPasswordStrength, hashPassword, verifyPassword } from "../lib/password.js";

describe("password policy", () => {
  it("rejects short passwords", () => {
    expect(assessPasswordStrength("Short1!", "a@b.com")).toBeTruthy();
  });

  it("rejects passwords containing the account email", () => {
    expect(assessPasswordStrength("thabo.mokoena.secret", "thabo.mokoena@birchleigh.co.za")).toBeTruthy();
  });

  it("accepts a long, non-common, non-email password", () => {
    expect(assessPasswordStrength("correct-horse-battery-staple-42", "owner@birchleigh.co.za")).toBeNull();
  });
});

describe("password hashing", () => {
  it("hashes are salted and verify correctly", async () => {
    const hash1 = await hashPassword("correct-horse-battery-staple-42");
    const hash2 = await hashPassword("correct-horse-battery-staple-42");
    expect(hash1).not.toBe(hash2); // argon2 salts each hash independently
    expect(await verifyPassword(hash1, "correct-horse-battery-staple-42")).toBe(true);
    expect(await verifyPassword(hash1, "wrong-password-entirely")).toBe(false);
  });
});
