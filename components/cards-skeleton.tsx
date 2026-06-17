export function CardsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl bg-card p-4 motion-safe:animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="size-7 shrink-0 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
            <div className="h-7 w-14 rounded-lg bg-muted" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <div className="h-6 w-20 rounded-lg bg-muted" />
            <div className="h-6 w-24 rounded-lg bg-muted" />
            <div className="h-6 w-16 rounded-lg bg-muted" />
          </div>
          <div className="mt-2 h-9 border-t border-border" />
        </div>
      ))}
    </div>
  );
}
