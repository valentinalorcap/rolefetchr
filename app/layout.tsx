import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/auth";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "job-matchmaker",
  description: "Remote jobs aggregated and scored against your CV.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {session ? (
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
