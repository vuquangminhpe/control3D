import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, encodedHash] = passwordHash.split("$");
  if (scheme !== "scrypt" || !salt || !encodedHash) return false;

  const expected = Buffer.from(encodedHash, "base64url");
  const actual = (await scryptAsync(password, salt, expected.byteLength)) as Buffer;
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}
