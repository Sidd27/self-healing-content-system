/**
 * Stage-by-stage pipeline test with simulated input.
 * Run: npx tsx scripts/test-stages.ts [stage]
 * Stages: extract | drift | generate | all
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { buildExtractPrompt, buildDriftPrompt, buildGeneratePrompt, buildProposeTopicsPrompt } from '../src/pipeline/prompts'

const provider = createOpenRouter({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.LLM_API_KEY ?? '',
})
const model = provider(process.env.LLM_MODEL_NAME ?? 'llama3:8b')
const TIMEOUT = 60_000

// ── Simulated input ────────────────────────────────────────────────────────────

const TOPIC_NAME = 'Cloud Run Autoscaling'
const TOPIC_DESC = 'How Cloud Run scales to zero, configures min/max instances, concurrency, and cold starts.'

const SOURCE_V1 = `
Cloud Run automatically scales the number of container instances based on incoming requests.
When there are no requests, Cloud Run scales down to zero instances by default.
You can configure a minimum number of instances to keep warm and avoid cold starts.
Maximum instances can be set to limit costs or protect downstream services.
Each instance handles up to 80 concurrent requests by default (configurable up to 1000).
Cold start latency is typically 1-3 seconds for most container images.
`.trim()

const SOURCE_V2 = `
Cloud Run automatically scales container instances based on incoming traffic.
When traffic drops to zero, Cloud Run scales to zero instances by default.
You can configure minimum instances (min-instances) to keep containers warm and eliminate cold starts.
Maximum instances can be capped to control costs or protect backend services.
Each instance handles up to 1000 concurrent requests (up from the previous default of 80).
Cold start latency is now typically under 1 second for optimized container images.
`.trim()

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(label: string) { console.log(`  ✓ ${label}`) }
function fail(label: string, err: unknown) { console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err) }

// ── Stage tests ────────────────────────────────────────────────────────────────

async function testExtract() {
  console.log('\n── Stage 4: Extract Topics ──')

  console.log('  [4a] Extract from v1...')
  try {
    const { text } = await generateText({
      model,
      prompt: buildExtractPrompt(TOPIC_NAME, TOPIC_DESC, SOURCE_V1),
      temperature: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT),
    })
    ok(`Extracted ${text.length} chars`)
    console.log('  Preview:', text.slice(0, 120).replace(/\n/g, ' ') + '...')
  } catch (e) { fail('Extract v1', e); return }

  console.log('  [4b] Propose new topics...')
  const ProposedSchema = z.array(z.object({ name: z.string(), description: z.string(), extractedContent: z.string() }))
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: ProposedSchema }),
      prompt: buildProposeTopicsPrompt([TOPIC_NAME], SOURCE_V1),
      abortSignal: AbortSignal.timeout(TIMEOUT),
    })
    ok(`Proposed ${output.length} new topic(s): ${output.map(t => t.name).join(', ') || 'none'}`)
  } catch (e) { fail('Propose topics', e) }
}

async function testDrift() {
  console.log('\n── Stage 5: Drift Analysis ──')

  const DriftSchema = z.object({
    changeType: z.enum(['NO_CHANGE','MINOR_EDIT','SEMANTIC_CHANGE','MAJOR_RESTRUCTURE','CONTENT_REMOVED']),
    driftScore: z.number().min(0).max(1),
    requiresRepair: z.boolean(),
    reason: z.string(),
  })

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: DriftSchema }),
      prompt: buildDriftPrompt(TOPIC_NAME, SOURCE_V1, SOURCE_V2),
      abortSignal: AbortSignal.timeout(TIMEOUT),
    })
    ok(`changeType=${output.changeType}  driftScore=${output.driftScore.toFixed(2)}  requiresRepair=${output.requiresRepair}`)
    console.log('  Reason:', output.reason)
  } catch (e) { fail('Drift analysis', e) }
}

async function testGenerate() {
  console.log('\n── Stage 7: Generate ──')

  const GenSchema = z.object({ question: z.string(), rationale: z.string(), lesson: z.string() })

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: GenSchema }),
      prompt: buildGeneratePrompt(TOPIC_NAME, TOPIC_DESC, SOURCE_V2),
      abortSignal: AbortSignal.timeout(TIMEOUT),
    })
    ok('Generated learning unit')
    console.log('  Q:', output.question.slice(0, 100))
    console.log('  R:', output.rationale.slice(0, 100))
    console.log('  L:', output.lesson.slice(0, 100))
  } catch (e) { fail('Generate', e) }
}

// ── Main ───────────────────────────────────────────────────────────────────────

const stage = process.argv[2] ?? 'all'

console.log(`\nModel: ${process.env.LLM_MODEL_NAME}  Base: ${process.env.OPENAI_BASE_URL}`)
console.log(`Running: ${stage}`)

;(async () => {
  if (stage === 'extract' || stage === 'all') await testExtract()
  if (stage === 'drift'   || stage === 'all') await testDrift()
  if (stage === 'generate'|| stage === 'all') await testGenerate()
  console.log('\nDone.')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
