# Valentina Lorca — Master CV

> Source of truth. `frontend.md`, `fullstack.md`, and per-company CVs are derived from this.
> TODO before sending anywhere: confirm GitHub has at least one solid project visible.

---

**Valentina Lorca Pavez**
Software Engineer · Angular · TypeScript · NestJS
valentina.lorcap@gmail.com · +34 614 450 897 · linkedin.com/in/valentinalorcap · github.com/valentinalorcap
Madrid, Spain · 100% remote · Contractor/EOR-ready · English C1 · Spanish native

---

## Professional Summary

Software Engineer with 5 years of experience building complex B2B SaaS products, primarily with TypeScript, Angular, and NestJS. Calm and effective when things are unclear or moving fast, with a strong product and UX-quality mindset for building software that is reliable, polished, and usable. Self-directed, curious, and fast to ramp up in unfamiliar technical domains. Currently focused on AI-assisted developer tooling, including RAG-based workflows and prompt-driven systems, and looking to keep growing in this space while contributing to thoughtful, collaborative engineering teams.

---

## Professional Experience

### Software Engineer — Cotalker
*March 2023 – Present · Fully remote*

*Multi-tenant B2B SaaS workflow automation platform serving 30K+ users across LatAm and North America; fully remote engineering team of 7.*

- Cut workflow configuration time from 30–60 minutes (via admin UI) to 1–4 minutes by designing and leading **cotctl**, an internal kubectl-inspired CLI. Introduced GitOps-style versioning, environment promotion, and AI-assisted scaffolding (RAG over internal docs + custom prompt skills) — 15 commands across auth, resource management, `apply`/`validate` operations. Authored 70+ Vitest test files.
- Led end-to-end development of a high-performance Angular task grid (**AG Grid Enterprise**) used by enterprise customers across multiple industries, with an Excel-familiar interface for working with 5,000+ records, bulk actions on operational tasks, fast inline editing, and complex data manipulation. Server-side row model with NgRx-backed hybrid pagination, 12 schema-driven custom cell components, and custom decorators for performance instrumentation and component render timing. Reduced task management time by ~70% with bulk actions vs one-by-one editing.
- Designed and shipped a user-sync pipeline in the NestJS monorepo, replicating user metadata from MongoDB to PostgreSQL via JSONB columns to enable reporting queries on user attributes and grouped extensions without cross-DB roundtrips. Also contribute services, migrations, and integrations supporting the platform's low-code automation engine.
- Own and evolve core Angular modules — task management, dynamic forms, calendars, list management — in the base product used daily by all enterprise customers. Lead refactors driven by customer requests, performance improvements, and new use cases, building modular and configuration-driven architectures. Maintain the shared component library; review peer PRs.

### Software Developer — Adolfo Ibáñez University
*August 2021 – March 2023 · Fully remote*

*Internal IT and digital transformation team at one of Chile's leading private universities.*

- Built UI components and automation flows using JavaScript, HTML, and Salesforce Lightning Web Components (LWC) across academic and administrative systems — automating data flows between previously disconnected platforms so internal teams could spend less time on manual sync and make faster, better-informed decisions for the people they serve.

---

## Technical Skills

- **Languages:** TypeScript · JavaScript
- **Frontend:** Angular · RxJS · NgRx · AG Grid Enterprise · Ionic · reactive forms · dynamic forms · performance optimization
- **Backend:** NestJS · Node.js · REST APIs · TypeORM · PostgreSQL · MongoDB · MySQL · Redis
- **Tooling:** Git · Docker · GitHub Actions · Sentry · CLI tooling
- **Testing:** Vitest · Jest · Karma/Jasmine · Cypress · Playwright; authored 70+ Vitest test files for cotctl

---

## Education

**Adolfo Ibáñez University**, Santiago, Chile — B.Sc. in Computer Science Engineering + B.Sc. in Industrial Engineering (dual degree, 2016–2021)

---

## Notes (internal — not for the CV)

- Should fit 1 page A4 at 10–11pt with standard margins. Verify after PDF export.
- For `cv/frontend.md`: drop the NestJS bullet, demote Backend in Skills, drop "NestJS" from the title line, lean Summary fully into frontend.
- For `cv/fullstack.md`: same as master, possibly add a second backend bullet if a stronger NestJS delivery emerges.
- For per-company versions: clone this file to `aplicaciones/[company]-[role]/cv.md`, retitle, and reorder/edit Cotalker bullets to lead with what that company cares about most. All per-application materials live in one folder under `aplicaciones/`.
- Removed for length / honesty: Chatmap, Python from Languages, YAML, "Team stack" framing for testing, "AI-assisted engineering" as a skill.
- "Schema-driven" used once (AG Grid bullet). "Configuration-driven" used in ownership bullet to avoid repetition.
- For ATS-strict applications (large corporate portals), generate a plain-ASCII version replacing `·` and `—` with `-` and `|`.
