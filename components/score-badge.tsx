import { cn } from "@/lib/utils";

// Color-coded fit score. Tuned for the graphite theme (translucent fills).
function toneFor(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (score >= 50) return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-rose-500/15 text-rose-300 border-rose-500/30";
}

export function ScoreBadge({
  score,
  size = "sm",
  className,
}: {
  score: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      title={`CV fit score: ${score}/100`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border font-semibold tabular-nums",
        size === "lg" ? "px-2.5 py-1 text-base" : "px-1.5 py-0.5 text-xs",
        toneFor(score),
        className,
      )}
    >
      {score}
      <span className={cn("font-normal opacity-60", size === "lg" ? "text-sm" : "text-[10px]")}>
        /100
      </span>
    </span>
  );
}
