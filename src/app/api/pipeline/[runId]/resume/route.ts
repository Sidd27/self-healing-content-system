import { NextResponse } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStages } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { runPipeline } from '@/pipeline/run'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params

  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId))
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (run.status !== 'failed') {
    return NextResponse.json({ error: `Run is ${run.status}, not failed` }, { status: 409 })
  }

  // Delete the failed stage record and reset run status atomically
  await db.transaction(async (tx) => {
    await tx.delete(pipelineStages).where(
      and(
        eq(pipelineStages.pipelineRunId, runId),
        eq(pipelineStages.status, 'failed')
      )
    )
    await tx.update(pipelineRuns)
      .set({ status: 'running', completedAt: null })
      .where(eq(pipelineRuns.id, runId))
  })

  // Re-run in background — already-completed stages are skipped by runStage idempotency
  runPipeline(run.id, run.sourceId).catch(console.error)

  return NextResponse.json({ ok: true })
}
