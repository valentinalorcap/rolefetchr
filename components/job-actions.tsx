"use client";

import { useTransition } from "react";
import type { ActionStatus } from "@prisma/client";
import { setJobAction, clearJobAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const OPTIONS: {
  status: ActionStatus;
  label: string;
  activeClass: string;
}[] = [
  { status: "SAVED", label: "Save", activeClass: "border-sky-500/40 bg-sky-500/15 text-sky-300" },
  { status: "APPLIED", label: "Applied", activeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  { status: "NOT_INTERESTED", label: "Archive", activeClass: "border-rose-500/40 bg-rose-500/15 text-rose-300" },
];

/** Save / Applied / Not-interested toggle. Clicking the active state clears it. */
export function JobActions({
  jobId,
  status,
}: {
  jobId: string;
  status: ActionStatus | null;
}) {
  const [pending, startTransition] = useTransition();

  function toggle(target: ActionStatus) {
    startTransition(async () => {
      if (status === target) {
        await clearJobAction(jobId);
      } else {
        await setJobAction(jobId, target);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS.map((o) => {
        const active = status === o.status;
        return (
          <button
            key={o.status}
            type="button"
            disabled={pending}
            aria-pressed={active}
            onClick={() => toggle(o.status)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              active
                ? o.activeClass
                : "border-input text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
