"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const navItems = [
  {
    href: "/" as const,
    label: "Map Game",
    match: (pathname: string, tab: string | null) =>
      pathname === "/" && (!tab || tab === "maps" || tab === "play"),
  },
  {
    href: "/?tab=editor" as const,
    label: "Map Editor",
    match: (pathname: string, tab: string | null) => pathname === "/" && tab === "editor",
  },
  {
    href: "/?tab=objects" as const,
    label: "Objects",
    match: (pathname: string, tab: string | null) => pathname === "/" && tab === "objects",
  },
  {
    href: "/admin/maps" as const,
    label: "Admin",
    match: (pathname: string) => pathname.startsWith("/admin"),
  },
];

export function AppNavbar() {
  return (
    <Suspense fallback={null}>
      <AppNavbarInner />
    </Suspense>
  );
}

function AppNavbarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");
  const [collapsed, setCollapsed] = useState(false);

  if (pathname === "/") {
    return null;
  }

  return (
    <header className={`workspace-topbar${collapsed ? " collapsed" : ""}`}>
      <Link className="workspace-topbar-brand" href="/">
        Control3D
      </Link>

      <nav aria-label="Primary" className="top-nav">
        {navItems.map((item) => (
          <Link
            aria-current={item.match(pathname, activeTab) ? "page" : undefined}
            className={`top-nav-link${item.match(pathname, activeTab) ? " active" : ""}`}
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
