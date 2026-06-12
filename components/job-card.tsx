import Link from "next/link";
import type { Source } from "@prisma/client";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/score-badge";
import { JobActions } from "@/components/job-actions";
import type { JobWithRelations } from "@/lib/jobs";
import { relativeTime, snippet } from "@/lib/format";

const SOURCE_LABEL: Record<Source, string> = {
  REMOTEOK: "RemoteOK",
  REMOTIVE: "Remotive",
  WEWORKREMOTELY: "WeWorkRemotely",
  HACKERNEWS: "Hacker News",
  MANUAL: "Manual",
  HIMALAYAS: "Himalayas",
  JSEARCH: "JSearch",
  EMAIL: "Email",
};

export function JobCard({ job }: { job: JobWithRelations }) {
  return (
    <Card className="min-w-0 transition-colors hover:border-foreground/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="min-w-0 break-words text-base leading-snug">
            <Link href={`/jobs/${job.id}`} className="hover:underline">
              {job.title}
            </Link>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {job.score ? <ScoreBadge score={job.score.score} /> : null}
            <Badge variant="secondary">
              {job.sourceLabel ?? SOURCE_LABEL[job.source]}
            </Badge>
          </div>
        </div>
        <div className="break-words text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{job.company}</span>
          {job.location ? <span> · {job.location}</span> : null}
          {job.salary ? <span> · {job.salary}</span> : null}
        </div>
        {job.score && !job.score.eligible ? (
          <Badge className="w-fit border-rose-500/40 bg-rose-500/15 font-medium text-rose-300">
            ⚠ Not eligible — location / work permit
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent>
        <p className="line-clamp-2 break-words text-sm text-muted-foreground">
          {snippet(job.description)}
        </p>
        {job.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.tags.slice(0, 6).map((tag) => (
              <Badge key={tag} variant="outline" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3">
        <JobActions jobId={job.id} status={job.action?.status ?? null} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <time dateTime={job.postedAt.toISOString()}>
            {relativeTime(job.postedAt)}
          </time>
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            View original ↗
          </a>
        </div>
      </CardFooter>
    </Card>
  );
}
