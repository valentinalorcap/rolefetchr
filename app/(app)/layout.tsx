import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { Sidebar } from "@/components/sidebar";
import { DemoBanner } from "@/components/demo-banner";

// Chrome for every authenticated page (owner or demo). Resolving the scope here
// and redirecting when it's gone means /signin lives outside this layout — so
// signing out, or a demo code going stale, unmounts the whole sidebar/banner
// subtree instead of leaving it cached behind the sign-in screen.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const scope = await getScope();
  if (!scope) redirect("/signin");
  const isDemo = scope.kind === "demo";

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isDemo={isDemo}
        companyLabel={isDemo ? scope.space.label : undefined}
      />
      <main className="min-w-0 flex-1">
        {isDemo ? (
          <DemoBanner label={scope.space.label} message={scope.space.message} />
        ) : null}
        {children}
      </main>
    </div>
  );
}
