"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  {
    href: "/" as const,
    label: "Map Editor",
    match: (pathname: string) => pathname === "/",
  },
  {
    href: "/lobby" as const,
    label: "Lobby",
    match: (pathname: string) => pathname.startsWith("/lobby"),
  },
  {
    href: "/models" as const,
    label: "Characters",
    match: (pathname: string) => pathname.startsWith("/models"),
  },
  {
    href: "/admin/maps" as const,
    label: "Admin",
    match: (pathname: string) => pathname.startsWith("/admin"),
  },
];

export function AppNavbar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <header className={`workspace-topbar${collapsed ? " collapsed" : ""}`}>
      <Link className="workspace-topbar-brand" href="/">
        Control3D
      </Link>

      <nav aria-label="Primary" className="top-nav">
        {navItems.map((item) => (
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
