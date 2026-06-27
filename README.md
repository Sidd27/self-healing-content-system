# Self-Healing Content System

A system that keeps AI-generated learning content accurate as source materials change. When a source document (URL, PDF, or Markdown) is updated, the pipeline detects what changed, scores the semantic drift, and either auto-repairs or queues affected content for human review.

## Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Drizzle ORM** + **Supabase** (Postgres + Storage)
- **Mastra** + **OpenRouter** (Gemini 2.0 Flash) or local **Ollama** (Qwen 3.5)
- **Shadcn/ui** + Tailwind CSS v4

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd self-healing-content-system
npm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
# Supabase — postgres connection (Transaction pooler, port 6543)
# Supabase dashboard → Settings → Database → Connection Pooling → Transaction mode
DATABASE_URL=postgresql://postgres.xxxx:password@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres

# Supabase — file storage (PDF/MD uploads)
# Supabase dashboard → Settings → API → Project URL
SUPABASE_URL=https://xxxx.supabase.co
# Supabase dashboard → Settings → API → service_role key (secret)
SUPABASE_SERVICE_KEY=eyJ...

# LLM provider — OpenRouter (cloud) or Ollama (local), pick one:
#
# OpenRouter:
OPENAI_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL_NAME=google/gemini-2.0-flash-exp:free
LLM_API_KEY=sk-or-...
#
# Ollama (local):
# OPENAI_BASE_URL=http://localhost:11434/v1
# LLM_MODEL_NAME=qwen3.5:latest
# LLM_API_KEY=ollama
```

### 3. Supabase Storage bucket

In your Supabase project → **Storage** → **New bucket**:
- Name: `source-files`
- Toggle **Public bucket** ON

This is where uploaded PDFs and Markdown files are stored so the pipeline can re-fetch them on re-runs.

### 4. Run database migrations

```bash
npx drizzle-kit migrate
```

### 5. Seed initial data (optional)

```bash
npx tsx scripts/seed.ts
```

Creates two sources (a URL source and a PDF source) with pre-defined topics to test the pipeline immediately.

### 6. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/admin/sources`.

---

## How it works

### Pipeline (7 stages)

Every time you trigger a run on a source, these stages execute in order:

1. **Ingest** — fetch content from `source.url` (web page, Supabase Storage PDF/MD)
2. **Normalize** — clean text, compute MD5 hash
3. **Hash Check** — compare with previous version; stop if unchanged
4. **Extract Topics** — LLM extracts relevant passages per topic
5. **Drift Analysis** — LLM scores how much each topic's content changed (0–1)
6. **Repair Decision** — score < 0.75 → auto-apply; score ≥ 0.75 → human review queue
7. **Generate** — LLM writes question + rationale + lesson for changed topics

### Re-running a failed pipeline

For all source types (URL, PDF, MD) — go to the source page and click **Run Pipeline** again. PDF/MD files are stored in Supabase Storage from the first upload, so no re-upload is needed.

### Human review

- Drift score ≥ 0.75 → pipeline pauses, items queued at `/admin/review`
- New topics detected by LLM → proposed topics queued for approval
- Approving a proposed topic immediately generates its first learning unit

---

## Pages

### Admin
| Route | Purpose |
|---|---|
| `/admin/sources` | Manage sources, trigger pipeline |
| `/admin/sources/[id]` | Source detail, upload PDF/MD, run history |
| `/admin/pipeline/[runId]` | Live pipeline stage progress |
| `/admin/review` | Approve/reject drift items and proposed topics |

### Learner
| Route | Purpose |
|---|---|
| `/learner/topics` | Browse all topics grouped by source |
| `/learner/topics/[topicId]` | Learning unit with progressive reveal (question → rationale → lesson) |

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system design diagram, data model, component map, and key technical decisions.
