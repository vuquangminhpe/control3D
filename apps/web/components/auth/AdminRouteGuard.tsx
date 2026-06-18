"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      try {
        const response = await fetch("/api/admin/auth/me", { cache: "no-store" });
        if (cancelled) return;
        if (response.ok) {
          setAllowed(true);
          return;
        }
      } catch {
        // Fall through to login redirect.
      }

      if (!cancelled) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      }
    }

    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!allowed) {
    return (
      <main className="auth-page">
        <p className="auth-switch">Checking admin session...</p>
      </main>
    );
  }

  return children;
}
