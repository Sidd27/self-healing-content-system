import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { llmModel } from '@/lib/llm';

export const extractionAgent = new Agent({
  name: 'extraction-agent',
  id: 'extraction-agent',
  instructions:
    'You are a precise content analyst. Extract structured information from source documents exactly as instructed.',
  model: llmModel,
});

export const driftAgent = new Agent({
  name: 'drift-agent',
  id: 'drift-agent',
  instructions:
    'You analyze changes between two versions of content and assess the severity of drift for learning material accuracy.',
  model: llmModel,
});

export const generationAgent = new Agent({
  name: 'generation-agent',
  id: 'generation-agent',
  instructions:
    'You create high-quality learning content — questions, rationales, and lessons — grounded strictly in the provided source material.',
  model: llmModel,
});

export const mastra = new Mastra({
  agents: { extractionAgent, driftAgent, generationAgent },
});
