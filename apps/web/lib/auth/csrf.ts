import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseCookies } from "./cookies";

const CSRF_COOKIE = "c3d_csrf";
const CSRF_HEADER = "x-csrf-token";

function getSecret() {
  const secret = process.env.CONTROL3D_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CONTROL3D_AUTH_SECRET is required in production");
  }
  return "control3d-local-dev-secret-change-before-production";
}

function signToken(token: string) {
  return createHmac("sha256", getSecret()).update(token).digest("base64url");
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

export function createCsrfToken() {
  const token = randomBytes(32).toString("base64url");
  return `${token}.${signToken(token)}`;
}

export function setCsrfCookie(response: NextResponse, csrfToken: string) {
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function verifyCsrfToken(csrfToken: string | undefined | null) {
  if (!csrfToken) return false;
  const [token, signature] = csrfToken.split(".");
  if (!token || !signature) return false;
  const expected = Buffer.from(signToken(token));
  const actual = Buffer.from(signature);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export function verifyCsrfRequest(request: Request) {
  const headerToken = request.headers.get(CSRF_HEADER);
  const cookieToken = parseCookies(request).get(CSRF_COOKIE);
  return Boolean(
    headerToken &&
      cookieToken &&
      headerToken === cookieToken &&
      verifyCsrfToken(headerToken),
  );
}
