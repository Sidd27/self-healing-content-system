import { db } from '@/db'
import { sources } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { fetchAndExtract } from '@/lib/extractors/url'
import { extractFromPdf } from '@/lib/extractors/pdf'
import { extractFromMd } from '@/lib/extractors/md'
import { CONTENT_MAX_CHARS } from '@/lib/constants'

export async function ingestStage(
  _runId: string,
  sourceId: string
): Promise<{ rawContent: string }> {
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
  if (!source || !source.url) throw new Error(`Source not found or missing URL: ${sourceId}`)

  let rawContent: string

  if (source.type === 'url') {
    rawContent = await fetchAndExtract(source.url)
  } else {
    // PDF and MD are stored in Supabase Storage — fetch the bytes from the stored URL
    const res = await fetch(source.url)
    if (!res.ok) throw new Error(`Failed to fetch source file: ${res.status} ${source.url}`)

    if (source.type === 'pdf') {
      rawContent = await extractFromPdf(Buffer.from(await res.arrayBuffer()))
    } else {
      rawContent = extractFromMd(await res.text())
    }
  }

  if (rawContent.length > CONTENT_MAX_CHARS) {
    throw new Error(
      `Content exceeds max length (${rawContent.length} > ${CONTENT_MAX_CHARS} chars). Split the source.`
    )
  }

  return { rawContent }
}
