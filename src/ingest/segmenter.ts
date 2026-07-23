import type { Chapter, Document, Segment } from './models.js';
import { readText } from './text.js';
import { readHtml } from './html.js';

const SENT_SPLIT = /(?<=[。．.!！？!?…\n])/;

function splitOversizedSentence(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars + 1);
    if (cut <= 0) cut = rest.lastIndexOf('\t', maxChars + 1);
    if (cut <= 0) cut = rest.lastIndexOf('\n', maxChars + 1);
    if (cut <= 0) cut = maxChars;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function splitText(text: string, maxChars: number): string[] {
  const parts = text.split(SENT_SPLIT).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (p.length > maxChars) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      chunks.push(...splitOversizedSentence(p, maxChars));
      continue;
    }
    if (cur && cur.length + p.length > maxChars) {
      chunks.push(cur);
      cur = '';
    }
    cur += p;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text];
}

export function splitLongSegments(chapters: Chapter[], maxChars: number): void {
  if (!maxChars || maxChars <= 0) return;
  for (const ch of chapters) {
    const newSegs: Segment[] = [];
    let idx = 0;
    for (const s of ch.segments) {
      if (s.source.length <= maxChars || s.kind === 'heading') {
        s.index = idx;
        newSegs.push(s);
        idx++;
        continue;
      }
      const pieces = splitText(s.source, maxChars);
      for (let k = 0; k < pieces.length; k++) {
        if (k === 0) {
          newSegs.push({ ...s, index: idx, source: pieces[k], cont: false });
        } else {
          newSegs.push({
            index: idx,
            source: pieces[k],
            kind: 'text',
            resourceHref: s.resourceHref,
            cont: true,
          });
        }
        idx++;
      }
    }
    ch.segments = newSegs;
  }
}

export function loadDocument(
  filePath: string,
  sourceLang: string,
  targetLang: string,
  splitSegments = 0,
): Document {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  let doc: Document;
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
    doc = readText(filePath, sourceLang, targetLang);
  } else if (ext === '.html' || ext === '.htm') {
    doc = readHtml(filePath, sourceLang, targetLang);
  } else {
    throw new Error(`Unsupported format: ${ext} (supported: .txt, .md, .html)`);
  }
  if (splitSegments > 0) {
    splitLongSegments(doc.chapters, splitSegments);
  }
  return doc;
}

export function batchSegments(segments: Segment[], maxChars: number): Segment[][] {
  const batches: Segment[][] = [];
  let cur: Segment[] = [];
  let curLen = 0;
  for (const s of segments) {
    const slen = s.source.length;
    if (cur.length && curLen + slen > maxChars) {
      batches.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(s);
    curLen += slen;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function chapterBatches(chapter: Chapter, maxChars: number): Segment[][] {
  return batchSegments(
    chapter.segments.filter((s) => s.kind === 'text'),
    maxChars,
  );
}
