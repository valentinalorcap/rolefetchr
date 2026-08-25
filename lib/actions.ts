"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScope, exitDemo } from "@/lib/scope";

/** End the current demo session and return to the sign-in screen. */
export async function exitDemoAction() {
  await exitDemo();
  redirect("/signin");
}

/** Throws unless the job exists in the caller's scope (owner or their demo). */
async function assertInScope(jobId: string): Promise<void> {
  const scope = await getScope();
  if (!scope) throw new Error("Not authorized.");
  const job = await prisma.job.findFirst({
    where: { id: jobId, demoCode: scope.demoCode },
    select: { id: true },
  });
  if (!job) throw new Error("Job not found in this scope.");
}

/** Set (or change) the action on a job: SAVED / APPLIED / NOT_INTERESTED / … */
export async function setJobAction(jobId: string, status: ActionStatus) {
  await assertInScope(jobId);
  await prisma.jobAction.upsert({
    where: { jobId },
    create: { jobId, status },
    update: { status },
  });
  // Action state shows on every job surface; revalidate the whole tree.
  revalidatePath("/", "layout");
}

/** Remove any action on a job (toggle off). */
export async function clearJobAction(jobId: string) {
  await assertInScope(jobId);
  await prisma.jobAction.deleteMany({ where: { jobId } });
  revalidatePath("/", "layout");
}

/** Live count for the Filters drawer: jobs matching a pending selection. */
export async function countFilteredJobs(
  params: Record<string, string>,
  action?: string,
): Promise<number> {
  const scope = await getScope();
  if (!scope) throw new Error("Not authorized.");
  const { countJobs, parseJobFilters, BEST_MATCHES_BASE } = await import("@/lib/jobs");
  // Best matches carries a tab-level constraint the URL can't remove.
  const base = action === "/best" ? BEST_MATCHES_BASE : undefined;
  return countJobs(parseJobFilters(params), scope.demoCode, base);
}
