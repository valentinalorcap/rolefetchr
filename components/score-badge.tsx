import { cn } from "@/lib/utils";

// Cool, cohesive fit palette (not a green/yellow/red traffic light).
function tone(score: number): { color: string; bg: string } {
  if (score >= 70) return { color: "#5ed3c0", bg: "rgba(94,211,192,.16)" }; // teal
  if (score >= 50) return { color: "#7aa8ff", bg: "rgba(122,168,255,.16)" }; // periwinkle
  if (score >= 30) return { color: "#c7c7cc", bg: "rgba(255,255,255,.10)" }; // slate
  return { color: "#e3909e", bg: "rgba(227,144,158,.15)" }; // dim rose (low / blocked)
}

/** Score as a colored number (no pill background) with a gray "/100" beside it. */
export function ScoreBadge({
  score,
  size = "md",
  className,
}: {
  score: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = tone(score);
  return (
    <span
      className={cn("inline-flex items-baseline gap-1.5", className)}
      title={`CV fit: ${score}/100`}
    >
      <span
        className={cn(
          "font-bold tabular-nums",
          size === "sm" ? "text-sm" : "text-xl",
        )}
        style={{ color: t.color }}
      >
        {score}
      </span>
      <span className="text-sm font-semibold text-muted-foreground">/100</span>
    </span>
  );
}
