import { db } from '@/db'
import { sources } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { fetchAndExtract } from '@/lib/extractors/url'
import { extractFromPdf } from '@/lib/extractors/pdf'
import { extractFromMd } from '@/lib/extractors/md'
import { CONTENT_MAX_CHARS } from '@/lib/constants'

type PipelineFile = { buffer: Buffer; type: 'pdf' | 'md'; content?: string }

export async function ingestStage(
  _runId: string,
  sourceId: string,
  file?: PipelineFile
): Promise<{ rawContent: string }> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
  if (!source) throw new Error(`Source not found: ${sourceId}`)

  let rawContent: string

  if (source.type === 'url') {
    rawContent = await fetchAndExtract(source.url!)
  } else if (source.type === 'pdf') {
    if (!file?.buffer) throw new Error('PDF buffer required')
    rawContent = await extractFromPdf(file.buffer)
  } else {
    if (!file?.content) throw new Error('Markdown content required')
    rawContent = extractFromMd(file.content)
  }

  if (rawContent.length > CONTENT_MAX_CHARS) {
    throw new Error(
      `Content exceeds max length (${rawContent.length} > ${CONTENT_MAX_CHARS} chars). Split the source.`
    )
  }

  return { rawContent }
}
