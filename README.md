# Self-Healing Content System

A system that keeps AI-generated learning content accurate as source materials change.

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- Drizzle ORM + Supabase (Postgres)
- OpenRouter AI (Gemini 2.0 Flash)
- Shadcn/ui + Tailwind CSS
- Vercel deployment

## Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in:
   - `DATABASE_URL` — Supabase Postgres connection string
   - `OPENROUTER_API_KEY` — OpenRouter API key
4. Run database migrations: `npx drizzle-kit migrate`
5. Start dev server: `npm run dev`

## Architecture

See `docs/superpowers/specs/2026-06-26-self-healing-content-system-design.md` for full design.

### Pipeline stages
1. **Ingest** — fetch/extract content from URL, PDF, or Markdown
2. **Normalize** — clean text, compute MD5 hash
3. **Hash Check** — compare with previous version, stop if unchanged
4. **Extract Topics** — LLM extracts verbatim passages per topic (temp=0)
5. **Drift Analysis** — LLM scores how much each topic's content changed
6. **Repair Decision** — auto-apply low/medium drift; gate high drift for human review
7. **Generate** — LLM generates question + rationale + lesson for changed topics

### Human review
- Drift score ≥ 0.75 → requires human approval before regenerating
- New content sections → proposed topics require human approval
- Review queue at `/admin/review`

## UI

### Admin
- `/admin/sources` — manage sources, trigger pipeline
- `/admin/pipeline/[runId]` — live pipeline progress
- `/admin/review` — approve/reject high-drift items and proposed topics

### Learner
- `/learner/topics` — browse topics grouped by source
- `/learner/topics/[topicId]` — view learning unit with progressive reveal
