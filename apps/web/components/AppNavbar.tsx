"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ViewerRole = "guest" | "user" | "admin";

const navItems = [
  {
    href: "/" as const,
    label: "Map Editor",
    roles: ["admin"] as ViewerRole[],
    match: (pathname: string) => pathname === "/",
  },
  {
    href: "/lobby" as const,
    label: "Lobby",
    roles: ["guest", "user", "admin"] as ViewerRole[],
    match: (pathname: string) => pathname.startsWith("/lobby"),
  },
  {
    href: "/models" as const,
    label: "Characters",
    roles: ["admin"] as ViewerRole[],
    match: (pathname: string) => pathname.startsWith("/models"),
  },
  {
    href: "/admin/maps" as const,
    label: "Admin maps",
    roles: ["admin"] as ViewerRole[],
    match: (pathname: string) => pathname.startsWith("/admin"),
  },
  {
    href: "/login" as const,
    label: "Login",
    roles: ["guest"] as ViewerRole[],
    match: (pathname: string) => pathname === "/login",
  },
  {
    href: "/register" as const,
    label: "Register",
    roles: ["guest"] as ViewerRole[],
    match: (pathname: string) => pathname === "/register",
  },
  {
    href: "/admin/login" as const,
    label: "Admin login",
    roles: ["guest"] as ViewerRole[],
    match: (pathname: string) => pathname === "/admin/login",
  },
];

export function AppNavbar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [viewerRole, setViewerRole] = useState<ViewerRole>("guest");

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        const adminResponse = await fetch("/api/admin/auth/me", { cache: "no-store" });
        const adminPayload = await adminResponse.json().catch(() => null);
        if (!cancelled && adminResponse.ok && adminPayload?.success) {
          setViewerRole("admin");
          return;
        }
      } catch {
        // Try user auth below.
      }

      try {
        const userResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const userPayload = await userResponse.json().catch(() => null);
        if (!cancelled && userResponse.ok && userPayload?.success) {
          setViewerRole("user");
          return;
        }
      } catch {
        // Guest navigation is the safe default.
      }

      if (!cancelled) setViewerRole("guest");
    }

    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const visibleItems = useMemo(
    () => navItems.filter((item) => item.roles.includes(viewerRole)),
    [viewerRole],
  );

  return (
    <header className={`workspace-topbar${collapsed ? " collapsed" : ""}`}>
      <Link className="workspace-topbar-brand" href="/">
        Control3D
      </Link>

      <nav aria-label="Primary" className="top-nav">
        {visibleItems.map((item) => (
          <Link
            aria-current={item.match(pathname) ? "page" : undefined}
            className={`top-nav-link${item.match(pathname) ? " active" : ""}`}
            href={item.href as Route}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        aria-label={collapsed ? "Show navigation" : "Hide navigation"}
        className="workspace-topbar-toggle"
        onClick={() => setCollapsed((value) => !value)}
        type="button"
      >
        {collapsed ? "Menu" : "Hide"}
      </button>
    </header>
  );
}
