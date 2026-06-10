import type { JobSource } from "./types";
import { remoteOkSource } from "./remoteok";
import { remotiveSource } from "./remotive";

/** All active job sources. Register new adapters here. */
export const sources: JobSource[] = [remoteOkSource, remotiveSource];

export type { JobSource, NormalizedJob } from "./types";
