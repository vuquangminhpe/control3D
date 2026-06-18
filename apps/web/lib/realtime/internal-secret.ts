import { timingSafeEqual } from "node:crypto";

export function getInternalRealtimeSecret() {
  const configured =
    process.env.CONTROL3D_REALTIME_SECRET || process.env.CONTROL3D_AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return "control3d-local-dev-secret-change-before-production";
}

export function isInternalRealtimeRequest(request: Request) {
  const expected = getInternalRealtimeSecret();
  const provided = request.headers.get("x-control3d-realtime-secret");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.byteLength === providedBytes.byteLength &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}
