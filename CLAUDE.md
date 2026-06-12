# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state
Phases 0–8 done plus an MCP ingestion add-on. Built: scaffold, ingestion, browsing UI, AI scoring, saved/applied actions, 4 auto sources + mobile polish, in-app **Today** view (email digest dropped — see memory `no-email-digest`), an **MCP server** so an external agent (Claude Code/Desktop) can push jobs from sites we can't scrape (LinkedIn, etc.), a **Phase 7 UX redesign** (desktop-first, true-black dark theme, left sidebar + best-matches landing, redesigned cards), and **Phase 8 auth** (Auth.js v5 + GitHub login, single-tenant email allowlist gating every page). On the default branch via per-phase PRs. Live on Vercel; crons run via GitHub Actions (ingest daily, score every 30 min). Next/last: Phase 7's README + ship.

Sources live (6 auto + manual): RemoteOK + Remotive (JSON), WeWorkRemotely (RSS, two category feeds), Hacker News "Who's hiring" (Algolia API, remote-only comments), **Himalayas** (free JSON API, keyword search), **JSearch** (Google for Jobs via RapidAPI — covers LinkedIn/Indeed/Glassdoor; `JSEARCH_API_KEY`, free tier so queries run sequentially with a gap), plus `MANUAL` jobs added via MCP and `EMAIL` jobs from job-alert emails. The `sourceLabel` field holds the real platform for aggregator/manual/email sources (e.g. JSearch or EMAIL job from "LinkedIn").

**Email-in** (`POST /api/email-ingest`, `CRON_SECRET`-authed): a Google Apps Script in Valentina's Gmail (`scripts/gmail-job-alerts.gs`) forwards labeled job-alert emails; the endpoint extracts jobs with Claude (`lib/email-ingest.ts`, structured output), dedupes by normalized URL, ingests as `EMAIL`, and lets the cron score them. Covers no-API boards (LinkedIn/WTJ/Jobgether) without a domain or OAuth.

**Environment gotcha:** the machine's default Node is v16 (too old for Next 15). This project needs Node 22 — pinned in `.nvmrc`. Every shell must `nvm use` (or prepend `~/.nvm/versions/node/v22.22.2/bin` to PATH) before running npm/npx, or builds fail cryptically.

Common commands: `npm run dev` · `npm run build` · `npm run lint` · `npm run db:migrate` (create+apply migration) · `npm run db:deploy` (CI/prod) · `npm run db:studio`. `prisma generate` runs on `postinstall`.

## What this project is
Job aggregator with AI scoring against Valentina's CV. Pulls remote jobs from multiple sources (RemoteOK, Remotive, WeWorkRemotely, Hacker News), scores each one against her CV using Claude Sonnet, and surfaces top matches in a UI + email digest.

**Solves real pain:** Valentina was spending hours filtering US-only roles manually. This automates that.

## Who I'm working with
Valentina Lorca. Software Engineer, 5 years experience. Madrid-based, working remote via EOR (Deel). Currently at Cotalker (TypeScript / Angular / NestJS), actively searching for next role.

She built Klara (klara-de-huevo.vercel.app) already with the same stack. This project reuses that foundation.

## Tech stack (locked in)
- Next.js 15 App Router + TypeScript
- Tailwind + shadcn/ui
- Neon Postgres + Prisma
- Anthropic API (Claude Sonnet 4.6) with prompt caching
- Vercel deploy + GitHub Actions cron (Vercel Hobby caps crons at once/day)
- Resend for email digest

## Where things live
- `PLAN.md` — full phased plan with schemas, prompts, decisions
- `cv-context.md` — snapshot of Valentina's CV used as Claude scoring context
- Code (when you start building) goes in the root

## Workflow
- Follow `PLAN.md` phase by phase
- After each phase, ship a commit
- Daily commits visible on GitHub contribution graph (this matters for Valentina's job search portfolio)

## How to behave when helping
- Brief and direct — no fluff (see her preferences)
- Reply in neutral Latin American Spanish (no Argentinian register)
- No manual line breaks inside paragraphs/code blocks for copy-paste
- When she ships a phase, suggest a commit message + push
- Honest about gaps and risks; don't oversell features
- This is a PORTFOLIO piece — code quality matters (TypeScript strict, sensible tests, clean structure)

## Architecture (the big picture)
The system is two decoupled background pipelines feeding a read-heavy UI, not a request-time aggregator.

**Ingestion → scoring → display are separate, async stages connected through Postgres:**
- **Sources are adapters.** Each lives in `lib/sources/<name>.ts` and exposes fetch + parse to a common `Job` shape. Adding a source = one new adapter, no changes elsewhere. RemoteOK/Remotive are JSON APIs (need custom `User-Agent`); WeWorkRemotely is RSS; Hacker News means parsing the monthly "Who's hiring" thread.
- **`lib/ingest.ts`** runs adapters and dedups on the unique `(source, externalId)`; a secondary `title+company` hash guards against the same job appearing across sources.
- **Two independent crons**, both authed via `CRON_SECRET` and **triggered by GitHub Actions** (`.github/workflows/cron.yml`), not Vercel — the Hobby plan caps crons at once/day, which broke the hourly score schedule. The workflow hits the deployed routes on a schedule: `app/api/cron/ingest/route.ts` (daily) fills the DB; `app/api/cron/score/route.ts` (hourly) picks up jobs with no `JobScore` and scores a small batch to cap Anthropic cost. Scoring deliberately lags ingestion — jobs exist unscored before the scorer catches up. (A digest cron will be added in Phase 6.)
- **Scoring (`lib/scorer.ts`)** is the differentiator. `cv-context.md` is loaded as a system prompt with `cache_control: ephemeral` so the CV (the large, stable block) is cached and not re-billed per job. Output is structured via a Zod schema (`score 0-100`, `reasoning`, `matchedSkills`, `gaps`). The scoring rubric (stack/location/seniority/domain weights, Spain-EOR eligibility) lives in the prompt in `PLAN.md` Phase 3 — tune there.

**Data model** (`Job` is the hub; see full Prisma schema in `PLAN.md` Phase 0): `Job` 1:1 optional `JobScore`, `Job` 1:1 optional `JobAction` (SAVED/APPLIED/NOT_INTERESTED/INTERVIEW/REJECTED — drives the saved/applied tracker UI), plus `IngestionRun` for per-run logging. Both relations cascade-delete with the job.

**UI** is server components reading the DB directly, in an **Apple Health dark** look (true-black, `#1C1C1E` cards, left **sidebar** with nav + Sources list, top color-wash gradient). Routes: `/` = **Best matches** (`getBestMatches` — eligible jobs ≥50, sectioned Top/Worth-a-look), `/jobs` = full browse with the horizontal filter bar + pagination, `/saved`, `/applied`, `/jobs/[id]`. (The old `/today` is gone.) Cards: source monogram (`lib/source-meta` + `SourceIcon`), white title, a cool-palette score pill (`ScoreBadge`: teal 70+/periwinkle 50-69/slate 30-49/rose blocked) + `/100`, matched-skill chips, the not-eligible flag, and `JobActions`. Filters/sort/pagination stay URL search-param driven (`?source=`, `?keyword=`, `?fresh=`, `?minScore=`, `?status=`); user actions go through server actions writing `JobAction`.

## Differentiators (what makes this NOT just another aggregator)
1. AI scoring against personal CV (0-100 + reasoning + matched skills + gaps), plus an **`eligible` flag**: jobs that require relocation, on-site, or a visa/residency/work-authorization outside Spain (even subtle signals like a US W-2/401k) are flagged "Not eligible" and scored ≤15 regardless of stack fit.
2. Filters specific to her EOR-EU profile (Madrid-based, mid-level fullstack TS)
3. Saved/Applied/Not-Interested workflow
4. **Best matches** landing (`/`): curated, eligible jobs scored 50+, sectioned into Top (70+) and Worth a look (50-69). (Replaced both the email digest and the old Today view — Valentina pulls/reviews herself; see memory `no-email-digest`.)
5. **MCP server** (`/api/mcp`, bearer-authed via `MCP_TOKEN`): a rich tool surface so an external agent that knows Valentina well can drive the app. **Read**: `search_jobs`, `get_job`, `recent_matches`, `stats`, `get_cv`, `get_scoring_config`. **Write/act**: `add_job` (a LinkedIn/etc. posting we can't scrape), `set_job_action` (manage the saved/applied pipeline), `update_scoring_config` (edit rubric + candidate context), `rescore_all`. Scoring quality improves as that agent injects better context.

## Decision log
- **Node 22 (lts/jod)** for the project, pinned in `.nvmrc`. Machine default is Node 16, which can't run Next 15.
- **Prisma pinned to v6**, not v7. Prisma 7 drops `url` from the schema datasource and requires a runtime driver adapter — extra complexity and newness for an MVP. v6 keeps the classic `url = env("DATABASE_URL")` + `import { PrismaClient } from "@prisma/client"` flow the PLAN assumes. Revisit v7 + Neon serverless adapter post-v1 if serverless connection limits bite.
- **Classic `prisma-client-js` generator** (output to `node_modules/@prisma/client`), not the new `prisma-client` generator that writes into `app/` — keeps generated code out of the App Router tree and imports simple.
- **Prisma client singleton** in `lib/prisma.ts` (global-cached in dev) to avoid exhausting Neon connections on hot reload.
- **Scoring model `claude-sonnet-4-6`** (locked in PLAN) via `messages.parse()` + a Zod `output_config.format` for guaranteed structured output. Rubric + CV live in the cached `system` prefix (`cache_control: ephemeral`); only the per-job turn varies. Thinking disabled for batch cost/latency. `lib/cv-context.ts` reads `cv-context.md` at runtime — `next.config.ts` `outputFileTracingIncludes` bundles it into the score lambda (a dynamic `fs` path Next won't trace on its own).
- **Cheap title pre-filter before scoring** (`lib/title-filter.ts`) — `scoreBatch` skips the Sonnet call for jobs whose title is clearly non-software (sales/marketing/HR/clinical/non-SWE-engineer/Spanish equivalents), persisting score 0 with `model: "title-filter"`. High precision: an allowlist of her stack keywords overrides the denylist, so a real match is never filtered (verified 0 false positives over the dataset; ~15% of jobs skipped free). Each run still caps Sonnet scorings at `BATCH_SIZE` but scans a wider window so free rejects drain fast.
- **Rubric is runtime-editable, not hardcoded** — it lives in the `ScoringConfig` singleton (id=1) in the DB (`lib/cv-context.ts` seeds `DEFAULT_RUBRIC` on first read), with an optional `candidateContext`. `buildScoringSystemPrompt()` is async (reads the DB each scoring). Editable via the MCP `update_scoring_config` tool so an external agent can tune scoring without a deploy; `rescore_all` clears scores so the cron re-scores with the new rubric. The default rubric gates on **work eligibility** (worldwide/contractor-friendly = high; location-locked/auth-required = low) per Valentina's EOR/contractor reality.
- **Score cron is separate from ingest and lags it** — `/api/cron/score` (hourly) scores a small batch (6/run, ~6s/job, kept under the 60s lambda cap) of unscored jobs freshest-first; `/api/cron/ingest` (daily) only fetches. Jobs exist unscored until the scorer catches up.
- **Rubric is deliberately harsh / honest** — best real matches in a typical snapshot land ~50-65 (all "Senior"-level); 70+ is reserved for a genuine mid-level TS/EU-remote fit. Don't loosen it to manufacture green scores. (A genuine Angular/TS/EU-remote role does score ~88 — verified via MCP.)
- **Default relevance floor** — list views (home, Today) hide jobs scored below `DEFAULT_MIN_SCORE` (30) and unscored jobs; "Show all" disables it. Best-match sort ranks scored jobs only. Saved/Applied ignore the floor.
- **MCP via `mcp-handler`** at `app/api/[transport]/route.ts` (basePath `/api` → URL `/api/mcp`), bearer-authed by a manual wrapper (not OAuth). `MANUAL` source + nullable `sourceLabel` keep it generic across platforms rather than one enum value per site. Manual jobs are scored synchronously on add (`lib/manual-ingest.ts`), not via the cron.
- **Auth via Auth.js v5 (`next-auth@beta`), single-tenant** (`auth.ts` + `middleware.ts`) — GitHub provider, JWT sessions (no DB adapter), email allowlist (`ALLOWED_EMAILS`) enforced in the `signIn` callback. `middleware.ts` gates every page; its matcher excludes `/api/*` so crons (`CRON_SECRET`), the MCP server (`MCP_TOKEN`), email-ingest, and the NextAuth routes keep their own auth and are never redirected. Custom `/signin` (themed); the root layout hides the sidebar when there's no session; sign-out lives in the sidebar footer. **Deliberately not multi-tenant** — per-user CV/scores/actions is a data-model refactor left for the roadmap (PLAN Phase 8). Env: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `ALLOWED_EMAILS`.
