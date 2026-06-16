export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { logout, removeAuthCookies } from "@/lib/auth/session";
import { ok } from "@/lib/response";

export async function POST(request: Request) {
  await logout(request, "admin");
  const response = ok({ loggedOut: true });
  removeAuthCookies(response, "admin");
  return response;
}
