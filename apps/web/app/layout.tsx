import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
