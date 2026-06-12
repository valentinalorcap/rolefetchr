import Link from "next/link";
import { ScoreBadge } from "@/components/score-badge";
import { SourceIcon } from "@/components/source-icon";
import { JobActions } from "@/components/job-actions";
import type { JobWithRelations } from "@/lib/jobs";
import { sourceMeta } from "@/lib/source-meta";
import { relativeTime } from "@/lib/format";

export function JobCard({ job }: { job: JobWithRelations }) {
  const meta = sourceMeta(job.source, job.sourceLabel);
  const chips =
    job.score && job.score.matchedSkills.length > 0
      ? job.score.matchedSkills
      : job.tags;
  const notEligible = job.score ? !job.score.eligible : false;

  return (
    <div className="overflow-hidden rounded-2xl bg-card transition-colors hover:bg-accent">
      <div className="flex items-start gap-3 px-4 pt-4">
        <SourceIcon source={job.source} sourceLabel={job.sourceLabel} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/jobs/${job.id}`}
            className="line-clamp-2 break-words text-[17px] font-semibold leading-snug hover:underline"
          >
            {job.title}
          </Link>
          <div className="mt-0.5 break-words text-sm text-muted-foreground">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
            {job.salary ? ` · ${job.salary}` : ""}
          </div>
        </div>
        <Link
          href={`/jobs/${job.id}`}
          aria-label="Open job"
          className="text-xl leading-none text-muted-foreground/50"
        >
          ›
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        {job.score ? (
          <ScoreBadge score={job.score.score} />
        ) : (
          <span className="text-sm text-muted-foreground">Not scored yet</span>
        )}
        {chips.length > 0 ? (
          <div className="ml-auto flex max-w-[62%] flex-wrap justify-end gap-1.5">
            {chips.slice(0, 4).map((c) => (
              <span
                key={c}
                className="rounded-lg bg-secondary px-2 py-1 text-xs text-foreground/80"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {notEligible ? (
        <div
          className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[13px] font-semibold"
          style={{ color: "#e3909e", backgroundColor: "rgba(227,144,158,.07)" }}
        >
          ⚠️ Not eligible — location / work permit
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <JobActions jobId={job.id} status={job.action?.status ?? null} />
        <span className="shrink-0 text-xs text-muted-foreground">
          {meta.label} · {relativeTime(job.postedAt)}
        </span>
      </div>
    </div>
  );
}
