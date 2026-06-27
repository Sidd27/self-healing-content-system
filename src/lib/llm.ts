import { createOpenRouter } from '@openrouter/ai-sdk-provider';

// Switch provider by env var — no code change needed:
//   Ollama:      OPENAI_BASE_URL=http://localhost:11434/v1  LLM_API_KEY=ollama
//   OpenRouter:  OPENAI_BASE_URL=https://openrouter.ai/api/v1  LLM_API_KEY=sk-or-...
// createOpenRouter accepts a custom baseURL so it works for any OpenAI-compatible endpoint.
const provider = createOpenRouter({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.LLM_API_KEY ?? '',
});

export const llmModel = provider(process.env.LLM_MODEL_NAME ?? 'openrouter/free');

// Embedding provider — defaults to the same endpoint as LLM (works for Ollama).
// Set EMBEDDING_BASE_URL separately when your LLM provider doesn't support embeddings
// (e.g. OpenRouter for LLM + OpenAI directly for embeddings).
const embeddingProvider = createOpenRouter({
  baseURL: process.env.EMBEDDING_BASE_URL ?? process.env.OPENAI_BASE_URL,
  apiKey: process.env.LLM_API_KEY ?? '',
});

export const embeddingModel = embeddingProvider.embedding(
  process.env.EMBEDDING_MODEL_NAME ?? 'nomic-embed-text:latest'
);
