import { load } from 'cheerio';

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SelfHealingBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return res.text();
}

export function parseHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeContent(html: string): string {
  const $ = load(html);

  // Remove obvious non-content elements
  $(
    [
      'script',
      'style',
      'noscript',
      'header',
      'footer',
      'nav',
      'aside',
      'svg',
      'iframe',
      '.sidebar',
      '.toc',
      '.breadcrumbs',
      '.pagination',
      '.cookie',
      '.announcement',
    ].join(',')
  ).remove();

  // Prefer semantic content
  let root = $('main').first();

  if (!root.length) root = $('article').first();
  if (!root.length) root = $('[role="main"]').first();
  if (!root.length) root = $('body');

  return root
    .text()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
