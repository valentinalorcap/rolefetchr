"use server";

import { revalidatePath } from "next/cache";
import type { ActionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Set (or change) the user's action on a job: SAVED / APPLIED / NOT_INTERESTED / … */
export async function setJobAction(jobId: string, status: ActionStatus) {
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
  await prisma.jobAction.deleteMany({ where: { jobId } });
  revalidatePath("/", "layout");
}
