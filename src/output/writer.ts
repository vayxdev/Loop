import fs from 'node:fs';
import path from 'node:path';
import type { Chapter, Segment } from '../ingest/models.js';
import type { Manifest } from '../pipeline/runstore.js';

export interface AssembleOptions {
  manifest: Manifest;
  chapters: Chapter[];
  outDir: string;
  baseName: string;
  bilingual?: boolean;
  bilingualOrder?: 'target_first' | 'source_first';
  aboutPage?: boolean;
}

function mergedParagraphs(chapter: Chapter): Array<{ kind: string; target: string; source: string }> {
  const paras: string[][] = [];
  const srcs: string[][] = [];
  const kinds: string[] = [];
  for (const s of chapter.segments) {
    if (!s.source.trim()) continue;
    const text = s.target && s.target.trim() ? s.target : s.source;
    if (s.cont && paras.length) {
      paras[paras.length - 1].push(text);
      srcs[srcs.length - 1].push(s.source);
    } else {
      paras.push([text]);
      srcs.push([s.source]);
      kinds.push(s.kind);
    }
  }
  return kinds.map((k, i) => ({ kind: k, target: paras[i].join(''), source: srcs[i].join('') }));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMarkdown(chapters: Chapter[], bilingual: boolean, order: 'target_first' | 'source_first', about: string): string {
  const lines: string[] = [];
  for (const ch of chapters) {
    if (ch.titleTranslated || ch.title) {
      lines.push(`# ${ch.titleTranslated || ch.title}`);
      lines.push('');
    }
    for (const p of mergedParagraphs(ch)) {
      if (p.kind === 'heading') {
        lines.push(`## ${p.target}`);
        lines.push('');
        continue;
      }
      if (bilingual) {
        if (order === 'target_first') {
          lines.push(p.target);
          lines.push('');
          lines.push(`> ${p.source.replace(/\n/g, '\n> ')}`);
        } else {
          lines.push(`> ${p.source.replace(/\n/g, '\n> ')}`);
          lines.push('');
          lines.push(p.target);
        }
      } else {
        lines.push(p.target);
      }
      lines.push('');
    }
  }
  if (about) {
    lines.push('---');
    lines.push('');
    lines.push(about);
  }
  return lines.join('\n');
}

function buildHtml(chapters: Chapter[], title: string, bilingual: boolean, order: 'target_first' | 'source_first', about: string): string {
  const body: string[] = [];
  for (const ch of chapters) {
    if (ch.titleTranslated || ch.title) {
      body.push(`<h1>${escapeHtml(ch.titleTranslated || ch.title || '')}</h1>`);
    }
    for (const p of mergedParagraphs(ch)) {
      if (p.kind === 'heading') {
        body.push(`<h2>${escapeHtml(p.target)}</h2>`);
        continue;
      }
      if (bilingual) {
        if (order === 'target_first') {
          body.push(`<p>${escapeHtml(p.target).replace(/\n/g, '<br>')}</p>`);
          body.push(`<p class="source">${escapeHtml(p.source).replace(/\n/g, '<br>')}</p>`);
        } else {
          body.push(`<p class="source">${escapeHtml(p.source).replace(/\n/g, '<br>')}</p>`);
          body.push(`<p>${escapeHtml(p.target).replace(/\n/g, '<br>')}</p>`);
        }
      } else {
        body.push(`<p>${escapeHtml(p.target).replace(/\n/g, '<br>')}</p>`);
      }
    }
  }
  if (about) {
    body.push('<hr>');
    body.push(`<p>${escapeHtml(about).replace(/\n/g, '<br>')}</p>`);
  }
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: Georgia, serif; line-height: 1.8; max-width: 720px; margin: 2em auto; padding: 0 1em; }
.source { color: #6b6b6b; background: #f4f3f0; padding: 0.5em 0.8em; border-radius: 5px; }
</style>
</head>
<body>
${body.join('\n')}
</body>
</html>`;
}

function buildText(chapters: Chapter[], about: string): string {
  const lines: string[] = [];
  for (const ch of chapters) {
    if (ch.titleTranslated || ch.title) {
      lines.push(ch.titleTranslated || ch.title || '');
      lines.push('');
    }
    for (const p of mergedParagraphs(ch)) {
      lines.push(p.target);
      lines.push('');
    }
  }
  if (about) {
    lines.push('---');
    lines.push(about);
  }
  return lines.join('\n');
}

function aboutPage(manifest: Manifest): string {
  return `本书由 Loop 自动翻译。\n源语言：${manifest.sourceLang}\n目标语言：${manifest.targetLang}\n格式：${manifest.fmt}`;
}

export function assemble(options: AssembleOptions): string[] {
  fs.mkdirSync(options.outDir, { recursive: true });
  const about = options.aboutPage ? aboutPage(options.manifest) : '';
  const outputs: string[] = [];

  const monoPath = path.join(options.outDir, `${options.baseName}.zh.md`);
  fs.writeFileSync(monoPath, buildMarkdown(options.chapters, false, 'target_first', about), 'utf-8');
  outputs.push(monoPath);

  if (options.bilingual) {
    const biPath = path.join(options.outDir, `${options.baseName}.zh-bi.md`);
    fs.writeFileSync(biPath, buildMarkdown(options.chapters, true, options.bilingualOrder || 'target_first', about), 'utf-8');
    outputs.push(biPath);
  }

  const htmlPath = path.join(options.outDir, `${options.baseName}.zh.html`);
  fs.writeFileSync(
    htmlPath,
    buildHtml(options.chapters, options.manifest.title, false, 'target_first', about),
    'utf-8',
  );
  outputs.push(htmlPath);

  const txtPath = path.join(options.outDir, `${options.baseName}.zh.txt`);
  fs.writeFileSync(txtPath, buildText(options.chapters, about), 'utf-8');
  outputs.push(txtPath);

  return outputs;
}
