import fs from 'node:fs';
import type { Chapter, Document, Segment } from './models.js';

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export function readHtml(filePath: string, sourceLang: string, targetLang: string): Document {
  const html = fs.readFileSync(filePath, 'utf-8');
  const text = stripTags(html);
  const lines = text.split(/\r?\n/);
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || filePath;

  const chunks: string[] = [];
  let buffer: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (buffer.length) {
        chunks.push(buffer.join(' '));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) chunks.push(buffer.join(' '));

  const segments: Segment[] = chunks
    .filter((c) => c.trim().length > 0)
    .map((c, i) => ({
      index: i,
      source: c.trim(),
      kind: 'text' as const,
      cont: false,
    }));

  return {
    title,
    sourceLang,
    targetLang,
    fmt: 'html',
    chapters: [{ index: 0, segments }],
  };
}
