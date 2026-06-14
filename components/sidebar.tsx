"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Source } from "@prisma/client";
import { SourceIcon } from "@/components/source-icon";
import { sourceMeta } from "@/lib/source-meta";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Hoy", icon: "📅" },
  { href: "/jobs", label: "Jobs", icon: "💼" },
  { href: "/best", label: "Best matches", icon: "🚀" },
  { href: "/saved", label: "Saved", icon: "🤍" },
  { href: "/applied", label: "Applied", icon: "✅" },
  { href: "/archived", label: "Archived", icon: "🗄️" },
];

const SOURCES = Object.values(Source);

function navActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/jobs") return pathname === "/jobs" || pathname.startsWith("/jobs/");
  return pathname === href;
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-3.5 py-7 md:flex">
      <div className="px-2.5 pb-4 text-[25px] font-extrabold tracking-tight">
        job-matchmaker
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = navActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[15px] font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between px-2.5 py-1.5 text-[15px] font-bold">
        Sources <span className="text-xs text-muted-foreground">▾</span>
      </div>
      <div className="flex flex-col">
        {SOURCES.map((s) => (
          <Link
            key={s}
            href={`/jobs?source=${s}`}
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14.5px] transition-colors hover:bg-accent"
          >
            <SourceIcon source={s} className="size-6" />
            {sourceMeta(s).label}
            <span className="ml-auto text-muted-foreground/60">›</span>
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/signin" })}
        className="mt-auto flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[14.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="w-5 text-center">↪</span>
        Sign out
      </button>
    </aside>
  );
}
