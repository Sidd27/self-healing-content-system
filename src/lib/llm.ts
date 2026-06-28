import { createOpenAI } from '@ai-sdk/openai';

// Switch provider by env var — no code change needed:
//   Ollama:      OPENAI_BASE_URL=http://localhost:11434/v1  LLM_API_KEY=ollama
//   OpenRouter:  OPENAI_BASE_URL=https://openrouter.ai/api/v1  LLM_API_KEY=sk-or-...
const provider = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.LLM_API_KEY ?? '',
});

export const llmModel = provider(process.env.LLM_MODEL_NAME ?? 'llama3:8b');

