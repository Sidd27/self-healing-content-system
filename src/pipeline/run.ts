import { db } from '@/db'
import { pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runStage, skipStage } from './stage-runner'
import { ingestStage } from './stages/ingest'
import { normalizeStage } from './stages/normalize'
import { hashCheckStage } from './stages/hash-check'
import { extractTopicsStage } from './stages/extract-topics'
import { driftAnalysisStage } from './stages/drift-analysis'
import { repairDecisionStage } from './stages/repair-decision'
import { generateStage } from './stages/generate'

type PipelineFile = { buffer: Buffer; type: 'pdf' | 'md'; content?: string }

export async function runPipeline(
  runId: string,
  sourceId: string,
  file?: PipelineFile
): Promise<void> {
  const { rawContent } = await runStage(runId, 'ingest', () =>
    ingestStage(runId, sourceId, file)
  )

  const { normalized, hash } = await runStage(runId, 'normalize', () =>
    normalizeStage(runId, rawContent)
  )

  const { stopped, sourceVersionId } = await runStage(runId, 'hash_check', () =>
    hashCheckStage(runId, sourceId, hash, normalized)
  )

  if (stopped) {
    await skipStage(runId, 'extract_topics')
    await skipStage(runId, 'drift_analysis')
    await skipStage(runId, 'repair_decision')
    await skipStage(runId, 'generate')
    return
  }

  const { affectedTopicIds, firstRunTopicIds } = await runStage(runId, 'extract_topics', () =>
    extractTopicsStage(runId, sourceId, sourceVersionId, normalized)
  )

  if (affectedTopicIds.length === 0) {
    await skipStage(runId, 'drift_analysis')
    await skipStage(runId, 'repair_decision')
    // First-run topics go straight to generate (no drift to analyze)
    await runStage(runId, 'generate', () =>
      generateStage(runId, sourceVersionId, firstRunTopicIds)
    )
  } else {
    await runStage(runId, 'drift_analysis', () =>
      driftAnalysisStage(runId, affectedTopicIds, sourceVersionId)
    )

    const { paused } = await runStage(runId, 'repair_decision', () =>
      repairDecisionStage(runId)
    )

    if (paused) return

    // auto_applied drift items + any first-run topics in same pass
    await runStage(runId, 'generate', () =>
      generateStage(runId, sourceVersionId, firstRunTopicIds)
    )
  }

  await db
    .update(pipelineRuns)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(pipelineRuns.id, runId))
}
