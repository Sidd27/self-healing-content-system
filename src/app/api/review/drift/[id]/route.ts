import { NextResponse } from 'next/server'
import { db } from '@/db'
import { driftItems, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateForTopic } from '@/pipeline/stages/generate'
import { tryCompleteRun } from '@/lib/close-run'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action } = await req.json() as { action: 'approve' | 'reject' }

  const [item] = await db.select().from(driftItems).where(eq(driftItems.id, id))
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reject') {
    await db.update(driftItems).set({ status: 'rejected' }).where(eq(driftItems.id, id))
    await tryCompleteRun(item.pipelineRunId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    await db.update(driftItems).set({ status: 'approved' }).where(eq(driftItems.id, id))

    const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, item.pipelineRunId))
    if (!run || !run.sourceVersionId) {
      return NextResponse.json({ error: 'Run not found or has no source version' }, { status: 500 })
    }
    await generateForTopic(item.topicId, run.sourceVersionId, item.driftScore)
    await tryCompleteRun(item.pipelineRunId)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
