"use client";

export async function getCsrfToken() {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload?.success || !payload.data?.csrfToken) {
    throw new Error(payload?.error ?? "Unable to create CSRF token");
  }
  return String(payload.data.csrfToken);
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: { csrf?: boolean } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.csrf) {
    headers["x-csrf-token"] = await getCsrfToken();
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload.data as T;
}

export async function patchJson<T>(
  url: string,
  body: unknown,
  options: { csrf?: boolean } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.csrf) {
    headers["x-csrf-token"] = await getCsrfToken();
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload.data as T;
}

export async function postEmpty<T>(url: string, options: { csrf?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (options.csrf) {
    headers["x-csrf-token"] = await getCsrfToken();
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload.data as T;
}

export async function deleteJson<T>(url: string, options: { csrf?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (options.csrf) {
    headers["x-csrf-token"] = await getCsrfToken();
  }
  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload.data as T;
}
