import type { Source } from "@prisma/client";
import { sourceMeta } from "@/lib/source-meta";
import { cn } from "@/lib/utils";

/** A small monogram chip in the source's accent color (e.g. "in" for LinkedIn). */
export function SourceIcon({
  source,
  sourceLabel,
  className,
}: {
  source: Source;
  sourceLabel?: string | null;
  className?: string;
}) {
  const { code, color } = sourceMeta(source, sourceLabel);
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold tracking-tight",
        className,
      )}
      style={{ color, backgroundColor: `${color}28` }}
    >
      {code}
    </span>
  );
}
