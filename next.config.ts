import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP route reads cv-context.md at runtime via fs (the get_cv tool); Next
  // won't trace a dynamic path, so include it explicitly in that lambda bundle.
  outputFileTracingIncludes: {
    "/api/[transport]": ["./cv-context.md"],
  },
};

export default nextConfig;
