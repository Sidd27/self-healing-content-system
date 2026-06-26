import { createHash } from 'crypto'

export function normalizeContent(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')   // strip HTML tags
    .toLowerCase()
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim()
}

export function hashContent(normalized: string): string {
  // aggressive local collapse before hashing — never stored
  const forHashing = normalized.replace(/\s+/g, ' ').trim()
  return createHash('md5').update(forHashing).digest('hex')
}
