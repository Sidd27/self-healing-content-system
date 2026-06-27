import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sources, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { uploadSourceFile } from '@/lib/storage'
import { runPipeline } from '@/pipeline/run'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [source] = await db.select().from(sources).where(eq(sources.id, id))
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (source.type === 'pdf' || source.type === 'md') {
    if (!source.url) {
      // First run — file upload required
      const formData = await req.formData()
      const file = formData.get('file')
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'File required for pdf/md sources on first run' }, { status: 400 })
      }
      const { url } = await uploadSourceFile(id, file as File)
      await db.update(sources).set({ url }).where(eq(sources.id, id))
    }
    // Re-run: source.url already set from previous upload — nothing to do
  }

  const [run] = await db
    .insert(pipelineRuns)
    .values({ sourceId: id, status: 'running', triggeredAt: new Date() })
    .returning()

  runPipeline(run.id, id).catch(console.error)

  return NextResponse.json({ runId: run.id }, { status: 202 })
}
