"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/" as const,
    label: "Gallery",
    match: (pathname: string) => pathname === "/" || pathname.startsWith("/models"),
  },
  {
    href: "/upload" as const,
    label: "Upload",
    match: (pathname: string) => pathname.startsWith("/upload"),
  },
];

export function AppNavbar() {
  const pathname = usePathname();

  return (
    <header className="app-shell-header">
      <div className="app-shell-header-inner">
        <Link className="brand-mark" href="/">
          <span className="brand-mark-badge">3D</span>
          <div>
            <strong>Control3D</strong>
            <p>Model gallery and editor workspace</p>
          </div>
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
      </div>
    </header>
  );
}
