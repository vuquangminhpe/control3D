import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthSubjectType } from "@/lib/model-store";

export type AccessTokenPayload = {
  sub: string;
  subjectType: AuthSubjectType;
  sessionId: string;
  exp: number;
};

function getAuthSecret() {
  const secret = process.env.CONTROL3D_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CONTROL3D_AUTH_SECRET is required in production");
  }
  return "control3d-local-dev-secret-change-before-production";
}

function encodeJson(input: unknown) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function sign(input: string) {
  return createHmac("sha256", getAuthSecret()).update(input).digest("base64url");
}

export function createOpaqueToken() {
  return randomBytes(48).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function signAccessToken(input: Omit<AccessTokenPayload, "exp">, ttlSeconds = 15 * 60) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    ...input,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(unsigned));
  const actual = Buffer.from(parts[2]);
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AccessTokenPayload;
    if (!payload.sub || !payload.sessionId) return null;
    if (payload.subjectType !== "admin" && payload.subjectType !== "user") return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
