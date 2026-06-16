import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getJobById } from "@/lib/jobs";
import { getScope } from "@/lib/scope";
import { ScoreBadge } from "@/components/score-badge";
import { SourceIcon } from "@/components/source-icon";
import { JobActions } from "@/components/job-actions";
import { sourceMeta } from "@/lib/source-meta";
import { relativeTime } from "@/lib/format";
import { sanitizeDescription } from "@/lib/sanitize";

const GRADIENT =
  "radial-gradient(120% 130% at 8% -10%, rgba(255,120,160,.34), transparent 55%)," +
  "radial-gradient(130% 140% at 100% -10%, rgba(110,160,255,.32), transparent 55%)";
const FADE = "linear-gradient(180deg,#000 0%,#000 35%,transparent 100%)";

export default async function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scope = await getScope();
  if (!scope) redirect("/signin");
  const job = await getJobById(id, scope.demoCode);
  if (!job) notFound();

  const meta = sourceMeta(job.source, job.sourceLabel);
  const notEligible = job.score ? !job.score.eligible : false;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[260px]"
        style={{ background: GRADIENT, WebkitMaskImage: FADE, maskImage: FADE }}
      />
      <div className="relative z-10 mx-auto max-w-3xl px-5 py-8 md:px-8">
        <Link
          href="/jobs"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ‹ Back to jobs
        </Link>

        <div className="mt-4 flex items-start gap-3">
          <SourceIcon
            source={job.source}
            sourceLabel={job.sourceLabel}
            className="size-9 text-sm"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">
              {job.title}
            </h1>
            <p className="mt-1 break-words text-muted-foreground">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
              {job.salary ? ` · ${job.salary}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {meta.label} · posted {relativeTime(job.postedAt)}
            </p>
          </div>
        </div>

        {notEligible ? (
          <div
            className="mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{ color: "#e3909e", backgroundColor: "rgba(227,144,158,.10)" }}
          >
            ⚠️ Not eligible — requires relocation, on-site, or a work
            permit/residency outside Spain
          </div>
        ) : null}

        <div className="mt-4">
          <JobActions jobId={job.id} status={job.action?.status ?? null} />
        </div>

        {job.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {job.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-secondary px-2 py-1 text-xs text-foreground/80"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {job.score ? (
          <section className="mt-6 rounded-2xl bg-card p-5">
            <div className="flex items-center gap-3">
              <ScoreBadge score={job.score.score} size="md" />
              <h2 className="text-sm font-medium text-muted-foreground">
                CV fit score
              </h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{job.score.reasoning}</p>

            {job.score.matchedSkills.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">Matched</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {job.score.matchedSkills.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg px-2 py-1 text-xs"
                      style={{ color: "#5ed3c0", backgroundColor: "rgba(94,211,192,.14)" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {job.score.gaps.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Gaps</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {job.score.gaps.map((g) => (
                    <span
                      key={g}
                      className="rounded-lg px-2 py-1 text-xs"
                      style={{ color: "#e3909e", backgroundColor: "rgba(227,144,158,.12)" }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Apply on {meta.label} ↗
        </a>

        <article
          className="prose prose-invert prose-sm mt-8 max-w-none break-words prose-headings:font-semibold prose-a:text-primary"
          dangerouslySetInnerHTML={{
            __html: sanitizeDescription(job.description),
          }}
        />
      </div>
    </div>
  );
}
