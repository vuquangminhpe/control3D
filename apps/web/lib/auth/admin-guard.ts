import { fail } from "@/lib/response";
import { authenticateRequest } from "./session";
import { verifyCsrfRequest } from "./csrf";

export async function requireAdmin(
  request: Request,
  permission?: string,
  options?: { csrf?: boolean },
) {
  const auth = await authenticateRequest(request, "admin");
  if (!auth || auth.subjectType !== "admin") {
    return { error: fail("Unauthorized admin request", 401) };
  }

  if (options?.csrf && !verifyCsrfRequest(request)) {
    return { error: fail("Invalid CSRF token", 403) };
  }

  if (
    permission &&
    !auth.admin.permissions.includes("*") &&
    !auth.admin.permissions.includes(permission)
  ) {
    return { error: fail("Forbidden admin request", 403) };
  }

  return { admin: auth.admin, sessionId: auth.sessionId };
}
