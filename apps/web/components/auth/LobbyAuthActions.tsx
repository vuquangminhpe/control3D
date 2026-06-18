"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

export function LobbyAuthActions() {
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthState() {
      for (const endpoint of ["/api/auth/me", "/api/admin/auth/me"]) {
        try {
          const response = await fetch(endpoint, { cache: "no-store" });
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.success) {
            if (!cancelled) setIsGuest(false);
            return;
          }
        } catch {
          // Try the next auth context.
        }
      }
      if (!cancelled) setIsGuest(true);
    }

    void loadAuthState();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isGuest) return null;

  return (
    <div className="inline-actions">
      <Link className="button secondary" href={"/login" as Route}>
        Login
      </Link>
      <Link className="button" href={"/register" as Route}>
        Register
      </Link>
    </div>
  );
}
