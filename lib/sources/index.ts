import type { JobSource } from "./types";
import { remoteOkSource } from "./remoteok";
import { remotiveSource } from "./remotive";
import { weWorkRemotelySource } from "./weworkremotely";
import { hackerNewsSource } from "./hackernews";
import { himalayasSource } from "./himalayas";
import { jsearchSource } from "./jsearch";
import { getOnBoardSource } from "./getonboard";
import { jobicySource } from "./jobicy";
import { workingNomadsSource } from "./workingnomads";
import { jobspressoSource } from "./jobspresso";
import { noDeskSource } from "./nodesk";
import { landingJobsSource } from "./landingjobs";
import { euRemoteJobsSource } from "./euremotejobs";
import { adzunaSource } from "./adzuna";

/** All active job sources. Register new adapters here. */
export const sources: JobSource[] = [
  remoteOkSource,
  remotiveSource,
  weWorkRemotelySource,
  hackerNewsSource,
  himalayasSource,
  jsearchSource,
  getOnBoardSource,
  jobicySource,
  workingNomadsSource,
  jobspressoSource,
  noDeskSource,
  landingJobsSource,
  euRemoteJobsSource,
  adzunaSource,
];

export type { JobSource, NormalizedJob } from "./types";
