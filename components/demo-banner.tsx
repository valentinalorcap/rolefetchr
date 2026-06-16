export function DemoBanner({
  label,
  message,
}: {
  label: string;
  message?: string | null;
}) {
  const text =
    message?.trim() ||
    `Demo workspace. The data here is illustrative only and the sources shown don't correspond to each posting. This access code belongs to ${label}.`;

  return (
    <div className="border-b border-border bg-secondary/60 px-5 py-2.5 text-center text-xs text-muted-foreground md:px-8">
      <span className="font-semibold text-foreground">Demo · {label}</span>
      {" — "}
      {text}
    </div>
  );
}
