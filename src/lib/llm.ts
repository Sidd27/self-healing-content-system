import { createOpenRouter } from '@openrouter/ai-sdk-provider';

// Switch provider by env var — no code change needed:
//   Ollama:      OPENAI_BASE_URL=http://localhost:11434/v1  LLM_API_KEY=ollama
//   OpenRouter:  OPENAI_BASE_URL=https://openrouter.ai/api/v1  LLM_API_KEY=sk-or-...
// createOpenRouter accepts a custom baseURL so it works for any OpenAI-compatible endpoint.
const provider = createOpenRouter({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '',
});

export const llmModel = provider(process.env.LLM_MODEL_NAME ?? 'openrouter/free');
