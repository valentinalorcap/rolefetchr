// Prisma CLI config. `dotenv/config` loads .env so DATABASE_URL is available to
// the CLI; the schema's datasource reads it via env("DATABASE_URL").
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
