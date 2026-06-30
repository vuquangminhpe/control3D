import {
  createAuthSession,
  createUser,
  getAdminByEmail,
  getAdminById,
  getAuthSessionById,
  getAuthSessionByRefreshHash,
  getUserByEmail,
  getUserById,
  markAdminLogin,
  markUserLogin,
  revokeAuthSession,
  revokeAuthSessionFamily,
  rotateAuthSession,
  upsertAdminCredentials,
  type AdminRecord,
  type AuthSubjectType,
  type UserRecord,
} from "@/lib/model-store";
import { clearAuthCookies, getAccessCookieName, getRefreshCookieName, parseCookies, setAuthCookies } from "./cookies";
import { hashPassword, verifyPassword } from "./password";
import { createOpaqueToken, hashOpaqueToken, signAccessToken, verifyAccessToken } from "./tokens";
import type { NextResponse } from "next/server";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SafeUser = Omit<UserRecord, "passwordHash">;
export type SafeAdmin = Omit<AdminRecord, "passwordHash">;

export type AuthenticatedSubject =
  | { subjectType: "user"; user: SafeUser; sessionId: string }
  | { subjectType: "admin"; admin: SafeAdmin; sessionId: string };

function safeUser(user: UserRecord): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function safeAdmin(admin: AdminRecord): SafeAdmin {
  const { passwordHash: _passwordHash, ...safe } = admin;
  return safe;
}

function getRequestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function refreshExpiresAt() {
  return new Date(Date.now() + REFRESH_TTL_MS).toISOString();
}

async function createCookieSession(
  subjectType: AuthSubjectType,
  subjectId: string,
  request: Request,
) {
  const refreshToken = createOpaqueToken();
  const session = await createAuthSession({
    subjectType,
    adminId: subjectType === "admin" ? subjectId : null,
    userId: subjectType === "user" ? subjectId : null,
    refreshTokenHash: hashOpaqueToken(refreshToken),
    userAgent: request.headers.get("user-agent"),
    ipAddress: getRequestIp(request),
    expiresAt: refreshExpiresAt(),
  });
  const accessToken = signAccessToken({
    sub: subjectId,
    subjectType,
    sessionId: session.id,
  });
  return { session, accessToken, refreshToken };
}

export function attachAuthCookies(
  response: NextResponse,
  subjectType: AuthSubjectType,
  tokens: { accessToken: string; refreshToken: string },
) {
  setAuthCookies(response, subjectType, tokens);
}

export function removeAuthCookies(response: NextResponse, subjectType: AuthSubjectType) {
  clearAuthCookies(response, subjectType);
}

export async function registerUser(input: {
  email: string;
  username: string;
  displayName: string;
  password: string;
  request: Request;
}) {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    throw new Error("Email is already registered");
  }
  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    email: input.email,
    username: input.username,
    displayName: input.displayName,
    passwordHash,
  });
  const tokens = await createCookieSession("user", user.id, input.request);
  return { user: safeUser(user), tokens };
}

export async function loginUser(input: { email: string; password: string; request: Request }) {
  const user = await getUserByEmail(input.email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  if (user.status !== "active") {
    throw new Error("User account is not active");
  }
  await markUserLogin(user.id);
  const tokens = await createCookieSession("user", user.id, input.request);
  return { user: safeUser({ ...user, lastLoginAt: new Date().toISOString() }), tokens };
}

export async function ensureDefaultAdmin() {
  const email = process.env.CONTROL3D_DEFAULT_ADMIN_EMAIL;
  const password = process.env.CONTROL3D_DEFAULT_ADMIN_PASSWORD;
  if (!email || !password) return;

  const passwordHash = await hashPassword(password);
  await upsertAdminCredentials({
    email,
    passwordHash,
    role: "super_admin",
    permissions: ["*"],
  });
}

export async function loginAdmin(input: { email: string; password: string; request: Request }) {
  await ensureDefaultAdmin();
  const admin = await getAdminByEmail(input.email);
  if (!admin || !(await verifyPassword(input.password, admin.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  if (!admin.isActive) {
    throw new Error("Admin account is not active");
  }
  await markAdminLogin(admin.id);
  const tokens = await createCookieSession("admin", admin.id, input.request);
  return { admin: safeAdmin({ ...admin, lastLoginAt: new Date().toISOString() }), tokens };
}

export async function authenticateRequest(
  request: Request,
  subjectType: AuthSubjectType,
): Promise<AuthenticatedSubject | null> {
  const token = parseCookies(request).get(getAccessCookieName(subjectType));
  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload || payload.subjectType !== subjectType) return null;

  const session = await getAuthSessionById(payload.sessionId);
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  if (subjectType === "admin") {
    const admin = payload.sub ? await getAdminById(payload.sub) : null;
    if (!admin || !admin.isActive) return null;
    return { subjectType: "admin", admin: safeAdmin(admin), sessionId: session.id };
  }

  const user = payload.sub ? await getUserById(payload.sub) : null;
  if (!user || user.status !== "active") return null;
  return { subjectType: "user", user: safeUser(user), sessionId: session.id };
}

export async function refreshAuth(request: Request, subjectType: AuthSubjectType) {
  const refreshToken = parseCookies(request).get(getRefreshCookieName(subjectType));
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }

  const session = await getAuthSessionByRefreshHash(hashOpaqueToken(refreshToken));
  if (!session || session.subjectType !== subjectType) {
    throw new Error("Invalid refresh token");
  }
  if (session.revokedAt) {
    await revokeAuthSessionFamily(session.refreshTokenFamily);
    throw new Error("Refresh token has been revoked");
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await revokeAuthSession(session.id);
    throw new Error("Refresh token has expired");
  }

  const subjectId = subjectType === "admin" ? session.adminId : session.userId;
  if (!subjectId) {
    throw new Error("Invalid session subject");
  }

  const nextRefreshToken = createOpaqueToken();
  const nextSession = await rotateAuthSession(
    session,
    hashOpaqueToken(nextRefreshToken),
    refreshExpiresAt(),
  );
  const accessToken = signAccessToken({
    sub: subjectId,
    subjectType,
    sessionId: nextSession.id,
  });

  if (subjectType === "admin") {
    const admin = await getAdminById(subjectId);
    if (!admin || !admin.isActive) throw new Error("Admin account is not active");
    return { admin: safeAdmin(admin), tokens: { accessToken, refreshToken: nextRefreshToken } };
  }

  const user = await getUserById(subjectId);
  if (!user || user.status !== "active") throw new Error("User account is not active");
  return { user: safeUser(user), tokens: { accessToken, refreshToken: nextRefreshToken } };
}

export async function logout(request: Request, subjectType: AuthSubjectType) {
  const cookies = parseCookies(request);
  const refreshToken = cookies.get(getRefreshCookieName(subjectType));
  if (refreshToken) {
    const session = await getAuthSessionByRefreshHash(hashOpaqueToken(refreshToken));
    if (session) await revokeAuthSession(session.id);
    return;
  }

  const accessToken = cookies.get(getAccessCookieName(subjectType));
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (payload?.subjectType === subjectType) {
    await revokeAuthSession(payload.sessionId);
  }
}
