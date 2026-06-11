"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/", label: "Jobs" },
  { href: "/saved", label: "Saved" },
  { href: "/applied", label: "Applied" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    // "Jobs" covers the list and individual job detail pages.
    return pathname === "/" || pathname.startsWith("/jobs");
  }
  return pathname === href;
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-3 font-semibold tracking-tight">
          job-matchmaker
        </Link>
        {LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
