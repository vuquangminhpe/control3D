export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createCsrfToken, setCsrfCookie } from "@/lib/auth/csrf";
import { ok } from "@/lib/response";

export async function GET() {
  const csrfToken = createCsrfToken();
  const response = ok({ csrfToken });
  setCsrfCookie(response, csrfToken);
  return response;
}
