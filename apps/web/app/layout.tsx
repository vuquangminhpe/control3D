import type { Metadata } from "next";
import { AppNavbar } from "@/components/AppNavbar";
import { ClientErrorLogger } from "@/components/ClientErrorLogger";
import "./globals.css";

export const metadata: Metadata = {
  title: "control3D",
  description: "3D Object Management MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <ClientErrorLogger />
          <AppNavbar />
          {children}
        </div>
      </body>
    </html>
  );
}
