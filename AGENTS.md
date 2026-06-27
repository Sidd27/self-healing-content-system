<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architecture & Technical Decisions

Full system design, component map, and key decisions live in `docs/ARCHITECTURE.md`. Read it before making structural changes. The most critical points for agentic workers:

- **LLM calls** go through Mastra agents in `src/mastra/index.ts`. Never call `createOpenRouter()` directly.
- **Model config** lives in `src/lib/llm.ts`. Three env vars control provider: `OPENAI_BASE_URL`, `LLM_MODEL_NAME`, `LLM_API_KEY`.
- **PDF extraction** uses `unpdf` (not `pdf-parse`). Do not add `@napi-rs/canvas` dependencies.
- **Supabase DB client** requires `{ ssl: 'require' }` in postgres-js options.
- **Scripts that import DB** must call `loadEnvConfig(process.cwd())` before any imports and create their own postgres client inline (ESM hoisting issue).
- **Next.js 15**: `params` in route handlers is a `Promise` — always `await params` before destructuring.
- **Append-only tables**: never DELETE from `source_versions`, `topic_extractions`, or `learning_unit_versions`.
- **Drift threshold**: < 0.75 = auto-apply, ≥ 0.75 = human review queue.

When making architectural changes, update `docs/ARCHITECTURE.md` to reflect them.
