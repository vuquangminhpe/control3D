import type { NextResponse } from "next/server";
import type { AuthSubjectType } from "@/lib/model-store";

const ACCESS_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

export function getAccessCookieName(subjectType: AuthSubjectType) {
  if (!isSecureCookie()) {
    return subjectType === "admin" ? "c3d_admin_at" : "c3d_user_at";
  }
  return subjectType === "admin" ? "__Host-c3d_admin_at" : "__Host-c3d_user_at";
}

export function getRefreshCookieName(subjectType: AuthSubjectType) {
  if (!isSecureCookie()) {
    return subjectType === "admin" ? "c3d_admin_rt" : "c3d_user_rt";
  }
  return subjectType === "admin" ? "__Host-c3d_admin_rt" : "__Host-c3d_user_rt";
}

export function parseCookies(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  return new Map(
    header
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        const key = index >= 0 ? entry.slice(0, index) : entry;
        const value = index >= 0 ? entry.slice(index + 1) : "";
        return [key, decodeURIComponent(value)] as const;
      }),
  );
}

export function setAuthCookies(
  response: NextResponse,
  subjectType: AuthSubjectType,
  input: { accessToken: string; refreshToken: string },
) {
  response.cookies.set(getAccessCookieName(subjectType), input.accessToken, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });
  response.cookies.set(getRefreshCookieName(subjectType), input.refreshToken, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookies(response: NextResponse, subjectType: AuthSubjectType) {
  response.cookies.set(getAccessCookieName(subjectType), "", {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(getRefreshCookieName(subjectType), "", {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
