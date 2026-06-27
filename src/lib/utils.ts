import { createHash } from 'crypto';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function hashContent(text: string): string {
  return createHash('md5').update(text.replace(/\s+/g, ' ').trim()).digest('hex');
}
