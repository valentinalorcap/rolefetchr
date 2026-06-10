# job-matchmaker

Job aggregator with AI scoring against a personal CV. Pulls remote jobs from multiple sources (RemoteOK, Remotive, WeWorkRemotely, Hacker News), scores each one 0–100 against the CV with Claude, and surfaces the top matches in a UI and a daily email digest.

**Why:** filtering out US-only roles by hand is slow. This automates the whole loop — fetch, score, browse, save/apply, and a digest of fresh high-fit jobs.

## Stack

Next.js 15 (App Router, TS) · Tailwind + shadcn/ui · Neon Postgres + Prisma · Anthropic API (Claude Sonnet) with prompt caching · Resend (email) · Vercel + Vercel Cron.

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

## Status

Early build, phase by phase per `PLAN.md`. See `CLAUDE.md` for architecture.
