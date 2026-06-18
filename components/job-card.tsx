import Link from "next/link";
import { ScoreBadge } from "@/components/score-badge";
import { SourceIcon } from "@/components/source-icon";
import { JobActions } from "@/components/job-actions";
import type { JobWithRelations } from "@/lib/jobs";
import { sourceMeta } from "@/lib/source-meta";
import { relativeTime, isLeadDescription } from "@/lib/format";

export function JobCard({ job }: { job: JobWithRelations }) {
  const meta = sourceMeta(job.source, job.sourceLabel);
  const chips =
    job.score && job.score.matchedSkills.length > 0
      ? job.score.matchedSkills
      : job.tags;
  const notEligible = job.score ? !job.score.eligible : false;
  const isLead = isLeadDescription(job.description);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-card transition-colors hover:bg-accent">
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
          <div className="mt-0.5 text-xs text-muted-foreground/70">
            Posted {relativeTime(job.postedAt)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5">
            {job.score ? <ScoreBadge score={job.score.score} /> : null}
            <Link
              href={`/jobs/${job.id}`}
              aria-label="Open job"
              className="text-xl leading-none text-muted-foreground/50"
            >
              ›
            </Link>
          </div>
          {job.score ? (
            <span className="whitespace-nowrap text-[11px] text-muted-foreground/60">
              scored {relativeTime(job.score.evaluatedAt)}
            </span>
          ) : null}
        </div>
      </div>

      {isLead || chips.length > 0 ? (
        <div className="mt-auto flex flex-wrap content-start items-start gap-1.5 px-4 pb-3.5 pt-5">
          {isLead ? (
            <span
              className="rounded-lg px-2 py-1 text-xs font-semibold"
              style={{ color: "#ffb340", backgroundColor: "rgba(255,179,64,.12)" }}
              title="Lead from an email alert — open the source to read the full posting"
            >
              ⚡ Lead · no description
            </span>
          ) : null}
          {chips.slice(0, 6).map((c) => (
            <span
              key={c}
              className="max-w-[250px] truncate rounded-lg bg-secondary px-2 py-1 text-xs text-foreground/80"
            >
              {c}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-auto" />
      )}

      {notEligible ? (
        <div
          className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[13px] font-semibold"
          style={{ color: "#e3909e", backgroundColor: "rgba(227,144,158,.07)" }}
        >
          ⚠️ Not eligible — location / work permit
        </div>
      ) : null}

      <div className="flex h-11 shrink-0 items-center gap-2.5 border-t border-border px-4">
        <JobActions jobId={job.id} status={job.action?.status ?? null} />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 text-xs text-muted-foreground">
          {/* Source label truncates first; the date always stays visible. */}
          <span className="min-w-0 truncate">{meta.label}</span>
          <span className="shrink-0 whitespace-nowrap">
            · added {relativeTime(job.fetchedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
