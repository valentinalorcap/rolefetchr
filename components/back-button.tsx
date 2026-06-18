"use client";

import { useRouter } from "next/navigation";

/**
 * Returns to the list via the browser's back stack rather than a forward link,
 * so the list lands on its exact previous scroll position and active filters
 * (and on whichever view you actually came from — Jobs, Today, Saved, …).
 * Falls back to `fallback` when the detail page was opened directly and there's
 * no in-app history to pop.
 */
export function BackButton({
  fallback = "/jobs",
  label = "Back to jobs",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      ‹ {label}
    </button>
  );
}
