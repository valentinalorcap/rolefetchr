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
import type { JobWithScore } from "@/lib/jobs";
import { relativeTime, snippet } from "@/lib/format";

const SOURCE_LABEL: Record<Source, string> = {
  REMOTEOK: "RemoteOK",
  REMOTIVE: "Remotive",
  WEWORKREMOTELY: "WeWorkRemotely",
  HACKERNEWS: "Hacker News",
};

export function JobCard({ job }: { job: JobWithScore }) {
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">
            <Link href={`/jobs/${job.id}`} className="hover:underline">
              {job.title}
            </Link>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {job.score ? <ScoreBadge score={job.score.score} /> : null}
            <Badge variant="secondary">{SOURCE_LABEL[job.source]}</Badge>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{job.company}</span>
          {job.location ? <span> · {job.location}</span> : null}
          {job.salary ? <span> · {job.salary}</span> : null}
        </div>
      </CardHeader>

      <CardContent>
        <p className="line-clamp-2 text-sm text-muted-foreground">
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

      <CardFooter className="justify-between text-xs text-muted-foreground">
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
      </CardFooter>
    </Card>
  );
}
