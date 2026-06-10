import Link from "next/link";
import { notFound } from "next/navigation";
import type { Source } from "@prisma/client";
import { getJobById } from "@/lib/jobs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime, stripHtml } from "@/lib/format";

const SOURCE_LABEL: Record<Source, string> = {
  REMOTEOK: "RemoteOK",
  REMOTIVE: "Remotive",
  WEWORKREMOTELY: "WeWorkRemotely",
  HACKERNEWS: "Hacker News",
};

export default async function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJobById(id);
  if (!job) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Back to jobs
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-muted-foreground">
            <span className="font-medium text-foreground">{job.company}</span>
            {job.location ? <span> · {job.location}</span> : null}
            {job.salary ? <span> · {job.salary}</span> : null}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {SOURCE_LABEL[job.source]}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <time dateTime={job.postedAt.toISOString()}>
          Posted {relativeTime(job.postedAt)}
        </time>
      </div>

      {job.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <a
        href={job.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants(), "mt-6")}
      >
        Apply on {SOURCE_LABEL[job.source]} ↗
      </a>

      <article className="mt-8 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
        {stripHtml(job.description)}
      </article>
    </main>
  );
}
