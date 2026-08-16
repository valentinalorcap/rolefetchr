import type { JobSource } from "./types";
import { remoteOkSource } from "./remoteok";
import { remotiveSource } from "./remotive";
import { weWorkRemotelySource } from "./weworkremotely";
import { hackerNewsSource } from "./hackernews";
import { himalayasSource } from "./himalayas";
import { jsearchSource } from "./jsearch";
import { getOnBoardSource } from "./getonboard";

/** All active job sources. Register new adapters here. */
export const sources: JobSource[] = [
  remoteOkSource,
  remotiveSource,
  weWorkRemotelySource,
  hackerNewsSource,
  himalayasSource,
  jsearchSource,
  getOnBoardSource,
];

export type { JobSource, NormalizedJob } from "./types";
