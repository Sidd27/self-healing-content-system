import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sources, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runPipeline } from '@/pipeline/run'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Look up source to determine type for file handling
  const [source] = await db.select().from(sources).where(eq(sources.id, id))
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (source.type === 'pdf' || source.type === 'md') {
    // Validate file BEFORE creating the run to avoid orphaned rows
    const formData = await req.formData()
    const fileEntry = formData.get('file')

    if (!fileEntry || typeof fileEntry === 'string') {
      return NextResponse.json({ error: 'File required for pdf/md sources' }, { status: 400 })
    }

    const arrayBuffer = await fileEntry.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const type = source.type as 'pdf' | 'md'
    const content = type === 'md' ? buffer.toString('utf-8') : undefined

    // Insert pipeline_run after validation succeeds
    const [run] = await db
      .insert(pipelineRuns)
      .values({ sourceId: id, status: 'running', triggeredAt: new Date() })
      .returning()

    // Fire and forget
    runPipeline(run.id, id, { buffer, type, content }).catch(console.error)

    return NextResponse.json({ runId: run.id }, { status: 202 })
  } else {
    // URL source — no file needed; insert run and fire immediately
    const [run] = await db
      .insert(pipelineRuns)
      .values({ sourceId: id, status: 'running', triggeredAt: new Date() })
      .returning()

    runPipeline(run.id, id).catch(console.error)

    return NextResponse.json({ runId: run.id }, { status: 202 })
  }
}
