import fs from 'node:fs';
import path from 'node:path';
import type { Chapter, Document, Segment } from './models.js';

function detectTitle(content: string, filePath: string): string {
  const firstLine = content.split(/\r?\n/)[0]?.trim();
  if (firstLine && firstLine.startsWith('# ')) {
    return firstLine.replace(/^#\s+/, '');
  }
  if (firstLine && firstLine.length < 120) {
    return firstLine;
  }
  return path.basename(filePath, path.extname(filePath));
}

function parseMarkdownChapters(content: string): Chapter[] {
  const lines = content.split(/\r?\n/);
  const chapters: Chapter[] = [];
  let currentSegments: Segment[] = [];
  let buffer: string[] = [];
  let currentTitle = '';
  let segIndex = 0;

  function flushParagraphs() {
    if (buffer.length === 0) return;
    const text = buffer.join('\n').trim();
    if (text) {
      currentSegments.push({
        index: segIndex++,
        source: text,
        kind: 'text',
        cont: false,
      });
    }
    buffer = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraphs();
      if (currentSegments.length > 0 || currentTitle) {
        chapters.push({
          index: chapters.length,
          title: currentTitle,
          segments: currentSegments,
        });
        currentSegments = [];
      }
      currentTitle = headingMatch[2].trim();
      currentSegments.push({
        index: segIndex++,
        source: currentTitle,
        kind: 'heading',
        cont: false,
      });
      continue;
    }

    if (line.trim() === '') {
      flushParagraphs();
    } else {
      buffer.push(line);
    }
  }
  flushParagraphs();

  if (currentSegments.length > 0 || chapters.length === 0) {
    chapters.push({
      index: chapters.length,
      title: currentTitle,
      segments: currentSegments,
    });
  }

  // If no headings found, treat entire document as one chapter
  if (chapters.length === 1 && !chapters[0].title) {
    chapters[0].title = '';
  }

  return chapters;
}

function parseTextChapters(content: string): Chapter[] {
  // Split by double newlines or lines that look like chapter markers
  const rawChunks = content.split(/\r?\n\s*\r?\n/);
  const chapters: Chapter[] = [];
  let segIndex = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i].trim();
    if (!chunk) continue;
    const lines = chunk.split(/\r?\n/);
    const maybeTitle = lines[0].trim();
    const isHeading = maybeTitle.length < 120 && /^[第\d一二三四五六七八九十]+章|Chapter\s+\d+|^\d+\.\s+/.test(maybeTitle);

    const segments: Segment[] = [];
    if (isHeading) {
      segments.push({
        index: segIndex++,
        source: maybeTitle,
        kind: 'heading',
        cont: false,
      });
      const body = lines.slice(1).join('\n').trim();
      if (body) {
        segments.push({
          index: segIndex++,
          source: body,
          kind: 'text',
          cont: false,
        });
      }
      chapters.push({ index: chapters.length, title: maybeTitle, segments });
    } else {
      segments.push({
        index: segIndex++,
        source: chunk,
        kind: 'text',
        cont: false,
      });
      chapters.push({ index: chapters.length, segments });
    }
  }

  return chapters;
}

export function readText(filePath: string, sourceLang: string, targetLang: string): Document {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const isMarkdown = ext === '.md' || ext === '.markdown';
  const chapters = isMarkdown ? parseMarkdownChapters(content) : parseTextChapters(content);
  const title = detectTitle(content, filePath);
  return { title, sourceLang, targetLang, fmt: isMarkdown ? 'md' : 'txt', chapters };
}
