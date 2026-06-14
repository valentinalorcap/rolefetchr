# Job Aggregator — Phased Plan

> Side project que resuelve dolor real (tiempo gastado filtrando jobs US-only) + portfolio piece con AI scoring contra CV. Stack reusa el de Klara: Next.js + Prisma + Neon + Anthropic API + Vercel.
>
> **Tiempo estimado total:** 5-7 días de trabajo focused (~30-40 horas).
> **Nombre tentativo del repo:** `job-matchmaker` (cambiar si se te ocurre algo mejor).

---

## Diferenciadores que lo separan de aggregators existentes

1. **AI scoring contra CV personal** — Claude evalúa fit de cada job (0-100 + reasoning), no es lista plana
2. **Filtros específicos para perfil EOR-EU** — Madrid/Spain-friendly, no US-only
3. **Workflow: applied / saved / not interested** — tracker integrado, no solo browse
4. **Email digest diario** con top fresh jobs > threshold

---

## Stack final

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | Next.js 15 App Router + TypeScript | Reuso de Klara |
| UI | Tailwind + shadcn/ui | Velocidad de prototipo |
| DB | Postgres en Neon | Reuso de Klara |
| ORM | Prisma | Reuso de Klara |
| AI | Anthropic API (Claude Sonnet 4.6) | Tu narrativa |
| Cron | Vercel Cron (Pro plan) o GitHub Actions | Free tier |
| Email | Resend | Free tier generoso |
| Deploy | Vercel | Reuso de Klara |

---

## Phase 0 — Setup & Foundations (Day 1, ~4 horas)

### Tareas
- [ ] Crear repo `job-matchmaker` en GitHub
- [ ] `npx create-next-app@latest` con TS + Tailwind + App Router
- [ ] Setup Neon Postgres + Prisma init
- [ ] Setup Vercel deploy (auto-deploy from main)
- [ ] Variables de entorno: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`
- [ ] README mínimo con descripción del proyecto

### Schema inicial (Prisma)

```prisma
model Job {
  id          String   @id @default(cuid())
  source      Source
  externalId  String   // ID original en la fuente
  title       String
  company     String
  description String   @db.Text
  location    String?
  remote      Boolean  @default(true)
  salary      String?
  tags        String[]
  sourceUrl   String
  postedAt    DateTime
  fetchedAt   DateTime @default(now())

  score       JobScore?
  action      JobAction?

  @@unique([source, externalId])
  @@index([postedAt])
  @@index([fetchedAt])
}

model JobScore {
  id          String   @id @default(cuid())
  jobId       String   @unique
  job         Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  score       Int      // 0-100
  reasoning   String   @db.Text
  matchedSkills String[]
  gaps        String[]
  evaluatedAt DateTime @default(now())
  model       String   // "claude-sonnet-4-6"
}

model JobAction {
  id        String       @id @default(cuid())
  jobId     String       @unique
  job       Job          @relation(fields: [jobId], references: [id], onDelete: Cascade)
  status    ActionStatus // SAVED | APPLIED | NOT_INTERESTED | INTERVIEW | REJECTED
  notes     String?      @db.Text
  updatedAt DateTime     @updatedAt
}

model IngestionRun {
  id          String   @id @default(cuid())
  source      Source
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  jobsFetched Int      @default(0)
  jobsNew     Int      @default(0)
  error       String?
}

enum Source {
  REMOTEOK
  REMOTIVE
  WEWORKREMOTELY
  HACKERNEWS
}

enum ActionStatus {
  SAVED
  APPLIED
  NOT_INTERESTED
  INTERVIEW
  REJECTED
}
```

### Deliverable
Repo deployed a Vercel, base "Hello world" + DB conectada.

---

## Phase 1 — Data Ingestion (Day 2, ~6 horas)

### Sources priorizadas (las más fáciles primero)

**RemoteOK** — JSON API público
- Endpoint: `https://remoteok.com/api`
- Headers: `User-Agent` (algunos rechazan default)
- Devuelve array, primer elemento son legales, resto son jobs

**Remotive** — JSON API público
- Endpoint: `https://remotive.com/api/remote-jobs`
- Bonus: filtros por categoría `?category=software-dev`

### Tareas
- [ ] Crear `lib/sources/remoteok.ts` con fetch + parse
- [ ] Crear `lib/sources/remotive.ts` con fetch + parse
- [ ] Crear `lib/ingest.ts` con lógica de dedup (chequear `source + externalId`)
- [ ] Crear route `app/api/cron/ingest/route.ts` con auth via `CRON_SECRET`
- [ ] Setup Vercel Cron en `vercel.json` (daily at 6am UTC)
- [ ] Logging básico (consola + tabla `IngestionRun`)

### Deliverable
Cron diario corre, llena DB con jobs de 2 sources, dedupea correctamente. Verificable con SQL query simple en Neon dashboard.

---

## Phase 2 — Job Display (Day 3, ~5 horas)

### Tareas
- [ ] Página `app/page.tsx` con server component que liste jobs
- [ ] Componente `JobCard` con: title, company, location, source badge, snippet de description, postedAt relativo, link al source
- [ ] Filtros (URL search params):
  - `?source=REMOTEOK,REMOTIVE`
  - `?keyword=typescript`
  - `?fresh=24h|48h|7d`
  - `?remote=true`
- [ ] Sort: postedAt desc (default), title asc
- [ ] Paginación simple (limit 50 + load more)
- [ ] Página `app/jobs/[id]/page.tsx` con detalle completo

### Deliverable
UI funcional para browsear jobs, filtrar, ver detalle. Sin AI scoring todavía.

---

## Phase 3 — AI Scoring (Day 4, ~6 horas) ⭐ EL DIFERENCIADOR

### Estrategia

Cargar tu CV master como contexto **una vez** y reusarlo para cada job. Usar **prompt caching** de Anthropic para que el CV no se cobre cada vez.

### Tareas
- [ ] Crear `lib/cv-context.ts` que lee `cv/master.md` (o lo paste como constante) y lo formatea como system prompt
- [ ] Crear `lib/scorer.ts` con función `scoreJob(job)`:
  - Input: job (title + description + tags + salary)
  - Output: `{ score, reasoning, matchedSkills, gaps }`
  - Usa Claude Sonnet 4.6 con structured outputs (Zod schema)
  - Sistema prompt con `cache_control: ephemeral` para CV
- [ ] Schema de output con Zod:
  ```typescript
  const ScoreSchema = z.object({
    score: z.number().min(0).max(100),
    reasoning: z.string(),
    matchedSkills: z.array(z.string()),
    gaps: z.array(z.string())
  });
  ```
- [ ] Route `app/api/cron/score/route.ts` que toma jobs sin score y los evalúa en batch (5-10 por run)
- [ ] Cron separado: corre cada hora, scorea backlog
- [ ] UI: agregar columna de score con color coding (verde >70, amarillo 50-70, rojo <50)
- [ ] UI: filtro `?minScore=70`

### Prompt sample (para tunear)

```
You are evaluating job fit for Valentina, a Software Engineer.

[CV context cached here with cache_control: ephemeral]

Job to evaluate:
Title: {title}
Company: {company}
Description: {description}
Location: {location}
Tags: {tags.join(', ')}

Score 0-100 based on:
- Stack match (TypeScript/React/Node/Angular = high; Ruby/Go/C# = medium with curiosity; .NET/Java enterprise = low)
- Location/remote eligibility (Spain-friendly EOR = high; US-only = very low)
- Seniority fit (mid-level = high; entry = medium; senior+ = lower)
- Domain interest (AI/dev tooling = high; banking = medium; defense = low)

Return:
- score: 0-100
- reasoning: 2-3 sentences why
- matchedSkills: strings from job that match Valentina's stack
- gaps: strings from job that are gaps
```

### Deliverable
Todos los jobs nuevos tienen score + reasoning. UI muestra ordenado por score.

---

## Phase 4 — User Actions (Day 5, ~4 horas)

### Tareas
- [ ] Botones en `JobCard`: "Save", "Applied", "Not Interested"
- [ ] Server action para crear/update `JobAction`
- [ ] Filtros: `?status=APPLIED|SAVED|NOT_INTERESTED`
- [ ] Página `app/saved/page.tsx` — todo lo guardado
- [ ] Página `app/applied/page.tsx` — todo lo aplicado (tracker simple)
- [ ] Default: ocultar jobs con `NOT_INTERESTED` salvo que se pida ver

### Deliverable
Workflow completo: browseo → save → apply → track.

---

## Phase 5 — More Sources & Polish (Day 6, ~5 horas)

### Sources adicionales
- [ ] **WeWorkRemotely RSS** — categoria "Full-Stack Programming" + "Front-End Programming"
- [ ] **Hacker News "Who's hiring"** — buscar thread mensual + parsear comments
- [ ] (Opcional) **Himalayas** — investigar si tienen API pública

### Polish
- [ ] Empty states bien hechos
- [ ] Mobile responsive
- [ ] Performance: paginación con cursor, indexes en queries comunes
- [ ] Error handling en cron failures (notificación + retry)
- [ ] Loading states con Suspense

### Deliverable
4+ sources funcionando, UI pulida para mobile y desktop.

---

## Phase 6 — Email Digest (Day 7, ~3 horas)

### Tareas
- [ ] Setup Resend (free tier: 100 emails/day)
- [ ] Template de email simple con top 10 jobs > 70 score, fresh < 48h
- [ ] Cron diario que envía a tu email
- [ ] Configuración: poder ajustar threshold + frecuencia
- [ ] Link en cada job que abre el detalle en la app

### Deliverable
Email diario funcionando.

---

## Phase 7 — README + Ship (Day 7, ~3 horas)

### README structure
1. ¿Qué es? (1 línea hook)
2. Demo link + screenshot
3. ¿Por qué lo construí? (su pain personal)
4. Features (con screenshots/GIFs)
5. Architecture diagram (Excalidraw, simple)
6. Stack
7. AI scoring approach (esto es lo único)
8. Sources soportadas + roadmap
9. Local setup (opcional)

### Polish final
- [ ] Screenshots de 3-4 vistas
- [ ] GIF corto del flujo: browse → score visible → save → email
- [ ] Demo público (decidir si requiere auth o es read-only abierto)
- [ ] Tag v1.0 release
- [ ] Anunciar (opcional): post de LinkedIn sobre el lanzamiento

### Deliverable
Repo público, demo live, README pulido. Portfolio-ready.

---

## Phase 8 — Auth (login gate)

Cerrar la app detrás de login para privacidad. El pipeline de búsqueda (saved/applied, reasoning del score, CV) deja de ser público. **Single-tenant a propósito**: una sola persona (allowlist de emails), no multi-usuario.

### Decisiones
- **Auth.js (NextAuth v5)** con provider **GitHub** — gratis, edge-compatible, natural para portfolio.
- **Sesión JWT**, sin adapter de DB (no se persiste usuario; no hace falta para single-tenant).
- **Allowlist por email** (`ALLOWED_EMAILS`, coma-separado) en el callback `signIn` — un GitHub válido fuera de la lista se rechaza.
- **`middleware.ts`** protege todas las páginas; excluye `/api/*` (crons con `CRON_SECRET`, MCP con `MCP_TOKEN`, email-ingest y las rutas de NextAuth se autentican por su cuenta), `/signin` y assets.
- **`/signin`** propio con el estilo del rediseño (gradiente + card). El layout oculta la sidebar sin sesión.
- **Sign out** en el pie de la sidebar.

### Env nuevas
`AUTH_SECRET` (openssl rand -hex 32), `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `ALLOWED_EMAILS`. La OAuth app de GitHub usa callback `https://<dominio>/api/auth/callback/github` (y `http://localhost:3000/api/auth/callback/github` para local).

### Fuera de scope (futuro)
Multi-tenant real (CV/JobScore/JobAction/ScoringConfig por usuario) — es un refactor del modelo de datos, no se hace ahora. Queda en el roadmap.

---

## Phase 9 — Scoring fuera de la app (sin IA en el server)

Para bajar el costo de tokens, la app deja de evaluar: solo *recupera* jobs. El scoring lo hace el agente propio de Valentina por MCP.

### Decisiones
- **Se saca el SDK de Anthropic por completo.** Borrados: `lib/scorer.ts`, `score-runner.ts`, `title-filter.ts`, `email-ingest.ts`, `/api/cron/score`, el schedule de score en GitHub Actions, y la dep `@anthropic-ai/sdk`.
- **Scoring por MCP:** el agente llama `get_unscored_jobs` (jobs sin score con todo el contenido en JSON), scorea contra `get_cv` + `get_scoring_config`, y escribe con `set_job_score` (score/eligible/reasoning/matchedSkills/gaps; `model` = "agent").
- **`add_job` ya no scorea** — agrega el job sin puntaje; el agente lo scorea después.
- **Email-in pasa al agente:** `/api/email-ingest` guarda el HTML crudo en la tabla nueva `PendingEmail` (sin IA). El agente: `list_pending_emails` → extrae → `add_job` → `mark_email_processed`. El Apps Script de Gmail no cambia (mismo payload).
- **El rubric sobrevive como guía** (`ScoringConfig`), editable por `update_scoring_config`; ya no es un prompt que mande la app.

### Resultado
La app no consume tokens. El costo de IA lo paga el agente de Valentina, que además scorea con el contexto que tiene de ella. Migración: `add_pending_email`.

---

## Roadmap post-v1 (backlog)

- [ ] Auth multi-usuario (cada uno con su CV)
- [ ] Browser extension para mark "I applied to this" desde LinkedIn/Greenhouse
- [ ] Más sources: Welcome to the Jungle (si encuentra forma), Otta, etc.
- [ ] Search semántico sobre descripciones con embeddings
- [ ] "Why did this job get this score?" interactivo con Claude chat
- [ ] Tracking de respuestas (auto-pull emails de gmail?)
- [ ] Notion/Linear sync para gente que ya track ahí

---

## Decisiones técnicas que vale clavar antes de empezar

1. **Auth o sin auth?** → MVP sin auth (single-user, vos). Si vas a hacerlo público, agregar después con Clerk o Auth.js.
2. **CV como string literal o file read?** → File read de `cv/master.md` para que se actualice automático cuando edites tu CV.
3. **Anthropic prompt caching** → SÍ, crítico para costos. CV es el bloque grande, cachealo.
4. **Cron via Vercel Pro o GitHub Actions?** → Si ya tenés Vercel Pro por Klara, usá Vercel Cron. Si no, GitHub Actions (free).
5. **Modelo:** Sonnet para scoring (calidad importa), Haiku si necesitás bajar costos.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| RemoteOK te bloquea por rate limit | User-Agent custom, retry con backoff exponencial |
| Costo de Anthropic se dispara | Prompt caching + scoring batch limitado por run |
| Cron Vercel free tier no alcanza | Migrar a GitHub Actions |
| Jobs duplicados entre sources | Hash de title+company para dedup secundario |
| Site se pone lento con mucho data | Indexes en Postgres, paginación con cursor |

---

## Métricas de éxito personales

Al final de la semana 1:
- [ ] Demo público funcionando
- [ ] 100+ jobs en DB scoreados
- [ ] Tu email digest llegando diariamente
- [ ] README pulido con screenshots
- [ ] 3+ commits por día visible en GitHub graph
- [ ] Capacidad de mostrarlo en interview como portfolio piece

A 1 mes:
- [ ] Lo usas vos para tu búsqueda real, ahorrás tiempo
- [ ] Estás aplicando a roles que el scoring identificó como fit alto
- [ ] Otros engineers (network) lo usan o se interesan
