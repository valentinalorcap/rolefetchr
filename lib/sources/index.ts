import type { JobSource } from "./types";
import { remoteOkSource } from "./remoteok";
import { remotiveSource } from "./remotive";
import { weWorkRemotelySource } from "./weworkremotely";
import { hackerNewsSource } from "./hackernews";
import { himalayasSource } from "./himalayas";
import { jsearchSource } from "./jsearch";

/** All active job sources. Register new adapters here. */
export const sources: JobSource[] = [
  remoteOkSource,
  remotiveSource,
  weWorkRemotelySource,
  hackerNewsSource,
  himalayasSource,
  jsearchSource,
];

export type { JobSource, NormalizedJob } from "./types";
