"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  {
    href: "/" as const,
    label: "Game Settings",
    match: (pathname: string) => pathname === "/",
  },
  {
    href: "/models" as const,
    label: "Models",
    match: (pathname: string) => pathname.startsWith("/models"),
  },
  {
    href: "/upload" as const,
    label: "Register",
    match: (pathname: string) => pathname.startsWith("/upload"),
  },
];

export function AppNavbar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("workspace-collapsed", collapsed);
    return () => {
      document.body.classList.remove("workspace-collapsed");
    };
  }, [collapsed]);

  return (
    <>
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/">
          <span className="workspace-brand-icon">C3</span>
          <span>
            <strong>Project Workspace</strong>
            <small>Control3D</small>
          </span>
        </Link>

        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="workspace-collapse-button"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          {collapsed ? ">" : "<"}
        </button>

        <nav aria-label="Workspace" className="workspace-side-nav">
          <Link className={pathname.startsWith("/models") ? "active" : ""} href="/models">
            <span>Assets</span>
          </Link>
          <Link className={pathname === "/" ? "active" : ""} href="/">
            <span>Game Setting</span>
          </Link>
          <Link className={pathname.startsWith("/upload") ? "active" : ""} href="/upload">
            <span>Register</span>
          </Link>
        </nav>

        <Link className="workspace-new-asset" href="/upload">
          New Asset
        </Link>
      </aside>

      <header className="workspace-topbar">
        <Link className="workspace-topbar-brand" href="/">
          <span>Control3D</span>
        </Link>

        <nav aria-label="Primary" className="top-nav">
          {navItems.map((item) => (
            <Link
              aria-current={item.match(pathname) ? "page" : undefined}
              className={`top-nav-link${item.match(pathname) ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
