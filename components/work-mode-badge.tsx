import type { WorkMode } from "@prisma/client";
import { cn } from "@/lib/utils";

const LABELS: Partial<Record<WorkMode, string>> = {
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

/** Small violet pill marking non-remote roles; renders nothing for REMOTE. */
export function WorkModeBadge({
  mode,
  className,
}: {
  mode: WorkMode;
  className?: string;
}) {
  const label = LABELS[mode];
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        className,
      )}
      style={{ color: "#bf83ff", backgroundColor: "rgba(191,131,255,.14)" }}
    >
      {label}
    </span>
  );
}
