export function extractFromMd(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '')        // strip code fences
    .replace(/`[^`]+`/g, '')               // strip inline code
    .replace(/#{1,6}\s+/g, '')             // strip headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // strip bold
    .replace(/__([^_]+)__/g, '$1')        // strip bold alt
    .replace(/\*([^*]+)\*/g, '$1')        // strip italic
    .replace(/_([^_]+)_/g, '$1')          // strip italic alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links, keep text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // strip images
    .replace(/^[-*+]\s+/gm, '')           // strip list markers
    .replace(/^\d+\.\s+/gm, '')           // strip ordered list markers
    .replace(/\n{3,}/g, '\n\n')           // collapse blank lines
    .trim()
}
