# job-matchmaker

Job aggregator with AI scoring against a personal CV. Pulls remote jobs from multiple sources (RemoteOK, Remotive, WeWorkRemotely, Hacker News), scores each one 0–100 against the CV with Claude, and surfaces the top matches in a UI and a daily email digest.

**Why:** filtering out US-only roles by hand is slow. This automates the whole loop — fetch, score, browse, save/apply, and a digest of fresh high-fit jobs.

## Stack

Next.js 15 (App Router, TS) · Tailwind + shadcn/ui · Neon Postgres + Prisma · Anthropic API (Claude Sonnet) with prompt caching · Resend (email) · Vercel · GitHub Actions cron.

## Local setup

Requires Node 22 (see `.nvmrc`).

```bash
nvm use            # Node 22
npm install
cp .env.example .env   # fill in DATABASE_URL, ANTHROPIC_API_KEY, RESEND_API_KEY, CRON_SECRET
npm run db:migrate     # apply schema to your Neon database
npm run dev
```

Open http://localhost:3000.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create + apply a migration (dev) |
| `npm run db:deploy` | Apply migrations (prod/CI) |
| `npm run db:studio` | Prisma Studio |

## MCP server

For sites that can't be scraped (LinkedIn, Welcome to the Jungle, Jobgether…), the app exposes an MCP server at `/api/mcp` so any MCP-capable agent can push jobs into the same pipeline — each is deduped, scored against the CV, and shown alongside the rest.

Tools: `add_job` (platform, url, title, company, description, …) and `recent_matches`. Bearer-authed with `MCP_TOKEN`.

Connect from Claude Code:

```bash
claude mcp add --transport http job-matchmaker \
  https://<your-app>.vercel.app/api/mcp \
  --header "Authorization: Bearer $MCP_TOKEN"
```

Claude Desktop: add a remote MCP connector with the same URL and `Authorization` header.

## Email-in

For boards without an API (LinkedIn, Welcome to the Jungle, Jobgether…), their **email job alerts** become a source. A Google Apps Script (`scripts/gmail-job-alerts.gs`) running in your own Gmail forwards labeled alert emails to `POST /api/email-ingest`, which extracts the jobs with Claude, dedupes, ingests, and scores them — no domain, OAuth project, or app password required. Setup is in the script's header (~10 min, one time). The endpoint is authed with `CRON_SECRET`.

## Status

Built phase by phase per `PLAN.md`. See `CLAUDE.md` for architecture.
