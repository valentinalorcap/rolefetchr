import type { Engagement } from "@prisma/client";
import { cn } from "@/lib/utils";

export const ENGAGEMENT_LABELS: Record<Engagement, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  FREELANCE: "Freelance",
};

// Full-time employment is the baseline every board assumes, so only the other
// arrangements get a pill; null (not declared) renders nothing.
const SHOWN: ReadonlySet<Engagement> = new Set(["PART_TIME", "CONTRACT", "FREELANCE"]);

/** Small amber pill marking part-time / contract / freelance postings. */
export function EngagementBadge({
  engagement,
  className,
}: {
  engagement: Engagement | null;
  className?: string;
}) {
  if (!engagement || !SHOWN.has(engagement)) return null;
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none",
        className,
      )}
      style={{ color: "#ffb340", backgroundColor: "rgba(255,179,64,.14)" }}
    >
      {ENGAGEMENT_LABELS[engagement]}
    </span>
  );
}
