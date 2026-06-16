import type { Metadata } from "next";
import "./globals.css";
import { getScope } from "@/lib/scope";
import { Sidebar } from "@/components/sidebar";
import { DemoBanner } from "@/components/demo-banner";

export const metadata: Metadata = {
  title: "job-matchmaker",
  description: "Remote jobs aggregated and scored against your CV.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const scope = await getScope();
  const isDemo = scope?.kind === "demo";

  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {scope ? (
          <div className="flex min-h-screen">
            <Sidebar isDemo={isDemo} />
            <main className="min-w-0 flex-1">
              {isDemo ? (
                <DemoBanner label={scope.space.label} message={scope.space.message} />
              ) : null}
              {children}
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
