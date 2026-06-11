import Link from "next/link";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/", label: "Jobs" },
  { href: "/saved", label: "Saved" },
  { href: "/applied", label: "Applied" },
];

export function SiteNav() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-3 font-semibold tracking-tight">
          job-matchmaker
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
