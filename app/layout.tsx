import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "job-matchmaker",
  description: "Remote jobs aggregated and scored against your CV.",
};

// Root layout is intentionally minimal — just <html>/<body>. The app chrome
// (sidebar + demo banner) lives in the (app) route group's layout, so /signin
// renders standalone and never shows stale demo chrome after the scope expires.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
