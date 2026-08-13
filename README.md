# rolefetchr

Personal job aggregator with agent-driven CV scoring. It pulls remote jobs from multiple sources into one place; an external AI agent (connected over MCP) scores each job 0–100 against a CV and writes the results back, and the app surfaces the top matches in a browsable UI with a saved/applied pipeline.

**Why:** filtering job boards by hand for roles that actually fit — right stack, right seniority, truly remote, contractor-friendly — is slow. This automates the loop: fetch, score, browse, track.

Live at [rolefetchr.valentinalorcap.com](https://rolefetchr.valentinalorcap.com) (single-tenant; sign-in is restricted to allowlisted accounts).

**Try the demo:** open the [sign-in page](https://rolefetchr.valentinalorcap.com/signin) and enter access code **`DEMO2026`** — a fully interactive workspace with fictional sample jobs, scores, and sources.

## How it works

Two decoupled pipelines feed a read-heavy UI through Postgres:

1. **Ingestion** — a daily GitHub Actions cron hits `/api/cron/ingest`, which runs a set of source adapters (`lib/sources/`) and dedupes into the `Job` table. Jobs land unscored.
2. **Scoring** — the app itself does not call any LLM. An external MCP-capable agent drives the loop: `get_unscored_jobs` → score each against `get_cv` + `get_scoring_config` → `set_job_score`. The CV, rubric, and candidate context are all stored in the database and editable over MCP, so scoring behavior can be tuned without a deploy.

Sources: RemoteOK, Remotive, WeWorkRemotely (RSS), Hacker News "Who's hiring", Himalayas, JSearch (Google for Jobs via RapidAPI — covers LinkedIn/Indeed/Glassdoor), plus jobs added manually over MCP and jobs extracted from email alerts.

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind + shadcn/ui · Neon Postgres + Prisma · Auth.js v5 (GitHub OAuth, email allowlist) · Vercel · GitHub Actions cron.

## Local setup

Requires Node 22 (see `.nvmrc`).

```bash
nvm use
npm install
cp .env.example .env   # fill in the values documented there
npm run db:migrate     # apply schema to your Postgres database
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

The app exposes an MCP server at `/api/mcp` (bearer-authed with `MCP_TOKEN`). It is the control surface for the external agent that does all the AI work:

- **Read**: `search_jobs`, `get_job`, `recent_matches`, `stats`, `get_unscored_jobs`, `get_cv`, `get_scoring_config`, `list_pending_emails`
- **Write**: `add_job` (for sites that can't be scraped — LinkedIn, Welcome to the Jungle, …), `set_job_score`, `set_job_action`, `update_scoring_config` (rubric, candidate context, and CV), `mark_email_processed`, `rescore_all`

Connect from Claude Code:

```bash
claude mcp add --transport http rolefetchr \
  https://<your-app>.vercel.app/api/mcp \
  --header "Authorization: Bearer $MCP_TOKEN"
```

Claude Desktop: add a remote MCP connector with the same URL and `Authorization` header.

## Email-in

Job boards without an API (LinkedIn, Welcome to the Jungle, Jobgether…) are covered through their **email job alerts**. A Google Apps Script (`scripts/gmail-job-alerts.gs`) running in your own Gmail forwards labeled alert emails to `POST /api/email-ingest` (authed with `CRON_SECRET`), which stores the raw email. The MCP agent then fetches pending emails, extracts the jobs, and adds them to the pipeline. No domain, OAuth project, or app password required — setup is in the script's header.
