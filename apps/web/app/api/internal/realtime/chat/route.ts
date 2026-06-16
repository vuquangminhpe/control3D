export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { timingSafeEqual } from "node:crypto";
import { chatMessageSchema } from "@control3d/shared/schemas/chat";
import { createChatMessage } from "@/lib/model-store";
import { fail, ok } from "@/lib/response";

function getExpectedSecret() {
  const configured =
    process.env.CONTROL3D_REALTIME_SECRET || process.env.CONTROL3D_AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return "control3d-local-dev-secret-change-before-production";
}

function isAuthorized(request: Request) {
  const expected = getExpectedSecret();
  const provided = request.headers.get("x-control3d-realtime-secret");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.byteLength === providedBytes.byteLength &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return fail("Unauthorized", 401);
  }

  const payload = await request.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Invalid realtime chat message", 422);
  }

  const message = await createChatMessage({
    id: parsed.data.id,
    mapId: parsed.data.mapId,
    sessionId: parsed.data.sessionId ?? null,
    userId: parsed.data.userId,
    displayName: parsed.data.displayName,
    channel: parsed.data.channel === "party" ? "map" : parsed.data.channel,
    body: parsed.data.body,
    createdAt: parsed.data.createdAt,
  });

  return ok({ message });
}
