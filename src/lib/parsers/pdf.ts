import { extractText, getDocumentProxy } from 'unpdf';

export async function extractPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export function parsePdf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
