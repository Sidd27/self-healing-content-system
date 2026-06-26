export async function fetchAndExtract(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SelfHealingBot/1.0)' },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')  // remove scripts
    .replace(/<style[\s\S]*?<\/style>/gi, '')     // remove styles
    .replace(/<[^>]+>/g, ' ')                     // strip tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
