import { getBestMatches, type JobWithRelations } from "@/lib/jobs";
import { PageShell } from "@/components/page-shell";
import { JobCard } from "@/components/job-card";

export const metadata = { title: "Best matches · job-matchmaker" };

function Section({
  title,
  sub,
  jobs,
}: {
  title: string;
  sub: string;
  jobs: JobWithRelations[];
}) {
  if (jobs.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-[21px] font-extrabold tracking-tight">{title}</h2>
      <p className="mt-0.5 mb-3.5 text-[13.5px] text-muted-foreground">{sub}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
    </section>
  );
}

export default async function BestMatches() {
  const { top, worth } = await getBestMatches();
  const total = top.length + worth.length;
  const best = top[0]?.score?.score ?? worth[0]?.score?.score;

  return (
    <PageShell
      title="Best matches"
      subtitle={`${total} strong ${total === 1 ? "match" : "matches"} · 50+ and eligible${best ? ` · best ${best}/100` : ""}`}
    >
      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No matches 50+ yet. New jobs are scored continuously — open Jobs to
          browse everything.
        </div>
      ) : (
        <>
          <Section title="Top matches" sub="70+ fit" jobs={top} />
          <Section title="Worth a look" sub="50–69 fit" jobs={worth} />
        </>
      )}
    </PageShell>
  );
}
