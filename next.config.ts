import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The score cron reads cv-context.md at runtime via fs; Next won't trace a
  // dynamic path, so include it explicitly in that route's lambda bundle.
  outputFileTracingIncludes: {
    "/api/cron/score": ["./cv-context.md"],
  },
};

export default nextConfig;
