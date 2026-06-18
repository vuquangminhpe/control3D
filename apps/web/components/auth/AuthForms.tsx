"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState, type FormEvent } from "react";
import {
  adminLoginSchema,
  loginSchema,
  userRegisterSchema,
} from "@control3d/shared/schemas/auth";
import { postJson } from "@/lib/client-auth";

type AuthMode = "user-login" | "user-register" | "admin-login";

const formCopy: Record<
  AuthMode,
  {
    title: string;
    eyebrow: string;
    submit: string;
    endpoint: string;
    meEndpoint: string;
    redirectTo: string;
  }
> = {
  "user-login": {
    title: "User login",
    eyebrow: "PLAYER ACCESS",
    submit: "Login",
    endpoint: "/api/auth/login",
    meEndpoint: "/api/auth/me",
    redirectTo: "/lobby",
  },
  "user-register": {
    title: "Create user account",
    eyebrow: "PLAYER ACCESS",
    submit: "Register",
    endpoint: "/api/auth/register",
    meEndpoint: "/api/auth/me",
    redirectTo: "/lobby",
  },
  "admin-login": {
    title: "Admin login",
    eyebrow: "ADMIN ACCESS",
    submit: "Login",
    endpoint: "/api/admin/auth/login",
    meEndpoint: "/api/admin/auth/me",
    redirectTo: "/admin/maps",
  },
};

type FormState = {
  email: string;
  password: string;
  username: string;
  displayName: string;
};

function validate(mode: AuthMode, state: FormState) {
  if (mode === "user-register") {
    return userRegisterSchema.safeParse(state);
  }
  if (mode === "admin-login") {
    return adminLoginSchema.safeParse(state);
  }
  return loginSchema.safeParse(state);
}

function getRedirectTarget(fallback: string) {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const copy = formCopy[mode];
  const [form, setForm] = useState<FormState>({
    email: "",
    password: "",
    username: "",
    displayName: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    let cancelled = false;

    async function redirectIfLoggedIn() {
      try {
        const response = await fetch(copy.meEndpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!cancelled && response.ok && payload?.success) {
          router.replace(getRedirectTarget(copy.redirectTo) as Route);
          router.refresh();
        }
      } catch {
        // Staying on the login form is expected for guests.
      }
    }

    void redirectIfLoggedIn();
    return () => {
      cancelled = true;
    };
  }, [copy.meEndpoint, copy.redirectTo, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsError(false);

    const parsed = validate(mode, form);
    if (!parsed.success) {
      setIsError(true);
      setMessage(parsed.error.issues[0]?.message ?? "Invalid form data");
      return;
    }

    setIsSubmitting(true);
    try {
      await postJson(copy.endpoint, parsed.data);
      const meResponse = await fetch(copy.meEndpoint, { cache: "no-store" });
      const mePayload = await meResponse.json().catch(() => null);
      if (!meResponse.ok || !mePayload?.success) {
        throw new Error(mePayload?.error ?? "Login succeeded but session was not confirmed");
      }
      router.replace(getRedirectTarget(copy.redirectTo) as Route);
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit}>
      <span className="auth-eyebrow">{copy.eyebrow}</span>
      <h1>{copy.title}</h1>

      <label className="field">
        Email
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setField("email", event.target.value)}
          required
          type="email"
          value={form.email}
        />
      </label>

      {mode === "user-register" ? (
        <>
          <label className="field">
            Username
            <input
              autoComplete="username"
              onChange={(event) => setField("username", event.target.value)}
              required
              value={form.username}
            />
          </label>

          <label className="field">
            Display name
            <input
              autoComplete="name"
              onChange={(event) => setField("displayName", event.target.value)}
              required
              value={form.displayName}
            />
          </label>
        </>
      ) : null}

      <label className="field">
        Password
        <input
          autoComplete={mode === "user-register" ? "new-password" : "current-password"}
          onChange={(event) => setField("password", event.target.value)}
          required
          type="password"
          value={form.password}
        />
      </label>

      {message ? (
        <p className={isError ? "error-text" : "success-text"}>{message}</p>
      ) : null}

      <button className="button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Submitting..." : copy.submit}
      </button>
    </form>
  );
}
