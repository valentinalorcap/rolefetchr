import Link from "next/link";

export const metadata = { title: "Demo link · rolefetchr" };

// Placeholder target for the sourceUrl of demo-space jobs: their postings are
// fictional, so instead of a dead external link they land here.
export default function DemoLinkPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center">
        <div className="text-2xl">🔗</div>
        <p className="mt-4 text-sm text-muted-foreground">
          This is a sample demo. This link would normally take you to the
          original job posting.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to the app
        </Link>
      </div>
    </div>
  );
}
