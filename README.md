# Self-Healing Content System

Keeps AI-generated learning content accurate as source materials change. When a source document (URL, PDF, or Markdown) is updated, the pipeline detects what changed, scores the semantic drift per topic, and either auto-repairs or queues affected content for human review.

Built for the Memorang Full-Stack Engineer Skills Exercise B.

---

## How It Works

```
Source updated
  → Ingest → Normalize → Hash Check (no-op if unchanged)
  → Extract Topics → Drift Analysis → Repair Decision
      ↓ drift < 0.75          ↓ drift ≥ 0.75
   Auto-apply              Human review queue
      ↓
   Generate: lesson + MCQ questions per topic
```

**First run:** LLM extracts topics → human approves each → Generate runs.  
**Re-run:** drift scored per topic → auto-heal or hold for review.

Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Drizzle ORM** + **Supabase** (Postgres + Storage)
- **Mastra AI** — provider-agnostic LLM calls (Ollama / OpenRouter / OpenAI)
- **shadcn/ui** + Tailwind CSS

---

## Prerequisites

- Node.js 20+
- [Supabase](https://supabase.com) project (free tier)
- LLM — local [Ollama](https://ollama.ai) **or** [OpenRouter](https://openrouter.ai) free tier

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

| Variable              | Where to get it                                                             |
| --------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`        | Supabase → Settings → Database → **Transaction pooler** URL (port **6543**) |
| `SUPABASE_URL`        | Supabase → Settings → API → Project URL                                     |
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API → `service_role` secret                           |
| `OPENAI_BASE_URL`     | `http://localhost:11434/v1` (Ollama) or `https://openrouter.ai/api/v1`      |
| `LLM_MODEL_NAME`      | e.g. `llama3.2:latest` or `meta-llama/llama-3.1-8b-instruct:free`           |
| `LLM_API_KEY`         | `ollama` (local) or your OpenRouter key                                     |

### 3. Supabase storage bucket

Supabase → Storage → **New bucket** → name: `source-files` → enable **Public**.

This stores uploaded PDFs and Markdown files so the pipeline can re-fetch them on re-runs without re-uploading.

### 4. Database

```bash
npx drizzle-kit push
```

### 5. Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Ollama (local, no API cost)

```bash
ollama pull llama3.2
```

`.env.local`:

```
OPENAI_BASE_URL=http://localhost:11434/v1
LLM_MODEL_NAME=llama3.2:latest
LLM_API_KEY=ollama
```

---

## Walkthrough

### Add a source

**Admin → Sources → Add Source** — choose PDF and paste a direct link (e.g. the [GCP Architect exam guide](https://services.google.com/fh/files/misc/professional_cloud_architect_exam_guide_english.pdf)), or leave the URL blank and upload a file on the source detail page.

### Run the pipeline

Open the source → **Run Pipeline**. Watch 7 stages execute live.

### Approve first-run topics

After Extract Topics, the run pauses. Proposed topics appear on the run page — approve to generate content, reject to discard.

### Simulate drift

Upload a revised version of the source (or paste a different URL) and run again:

- Drift **< 0.75** → auto-healed, new content generated immediately
- Drift **≥ 0.75** → held for review; approve/reject on the pipeline run page

### Learner view

**Learner → Browse Topics** → pick a topic:

- **Step 1** — read the lesson
- **Step 2** — answer MCQ questions; click an option to reveal right/wrong + rationale

---

## Admin pages

| Route                     | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `/admin/sources`          | List and create sources                                        |
| `/admin/sources/[id]`     | Source detail — upload file, version history, trigger pipeline |
| `/admin/pipeline`         | All pipeline runs across all sources                           |
| `/admin/pipeline/[runId]` | Live stage progress + inline approve/reject for pending items  |

---

## Project structure

```
src/
  app/
    admin/          # Sources, pipeline list, pipeline run detail
    learner/        # Topic browser + MCQ quiz
    api/            # REST endpoints
  pipeline/
    stages/         # ingest · normalize · hash-check · extract-topics
                    # drift-analysis · repair-decision · generate
    stage-runner.ts # Idempotent stage execution + resume
    run.ts          # 7-stage orchestration
  db/
    schema.ts       # Drizzle schema
  lib/
    extractors/     # URL, PDF (unpdf), Markdown
    normalize.ts    # Text normalization + MD5 hash
    llm.ts          # LLM provider config
docs/
  ARCHITECTURE.md   # System design, data model, decisions
```

---

## Useful scripts

```bash
npx tsx scripts/clean-db.ts          # Truncate all tables (keeps schema)
npx vitest run src/__tests__         # Unit tests (normalize, drift logic)
```
