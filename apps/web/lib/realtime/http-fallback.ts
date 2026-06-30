import { fail } from "@/lib/response";

export function isRealtimeHttpFallbackEnabled() {
  const explicit = process.env.CONTROL3D_ALLOW_REALTIME_HTTP_FALLBACK;
  if (explicit) return explicit === "true";

  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_CONTROL3D_ALLOW_REALTIME_FALLBACK !== "false"
  );
}

export function realtimeHttpFallbackRequired() {
  return fail("Realtime HTTP fallback is disabled. Use the realtime room server.", 503);
}
