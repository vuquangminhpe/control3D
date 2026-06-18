import { createHmac, timingSafeEqual } from "node:crypto";

export type RealtimeJoinTokenPayload = {
  mapId: string;
  userId: string;
  displayName: string;
  characterId: string | null;
  characterName: string | null;
  characterFileUrl: string | null;
  characterActions: Array<{
    id: string;
    name: string;
    fileUrl: string;
    enabled: boolean;
    trigger: string;
    keyBinding: string | null;
    durationMs: number | null;
  }>;
  isAdmin: boolean;
  exp: number;
};

function getRealtimeSecret() {
  const configured =
    process.env.CONTROL3D_REALTIME_SECRET || process.env.CONTROL3D_AUTH_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("CONTROL3D_REALTIME_SECRET is required in production.");
  }

  return (
    "control3d-local-dev-secret-change-before-production"
  );
}

function encodePayload(payload: RealtimeJoinTokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getRealtimeSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createRealtimeJoinToken(
  payload: Omit<RealtimeJoinTokenPayload, "exp">,
  ttlSeconds = 60,
) {
  const encodedPayload = encodePayload({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyRealtimeJoinToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = Buffer.from(signPayload(encodedPayload));
  const actual = Buffer.from(signature);
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as RealtimeJoinTokenPayload;
    if (!payload.mapId || !payload.userId || !payload.displayName) return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
