import fs from 'node:fs';
import path from 'node:path';
import type { Chapter, Document, Segment } from '../ingest/models.js';
import type { UsageSummary } from '../llm/types.js';

export const STATUS_PENDING = 'pending';
export const STATUS_TRANSLATING = 'translating';
export const STATUS_DONE = 'done';
export const REVIEW_PENDING = 'pending';
export const REVIEW_RUNNING = 'running';
export const REVIEW_DONE = 'done';
export const REVIEW_FAILED = 'failed';

export interface ManifestChapter {
  index: number;
  title?: string;
  titleTranslated?: string;
  status: string;
  reviewStatus?: string;
}

export interface Manifest {
  title: string;
  sourceLang: string;
  targetLang: string;
  fmt: string;
  initialized: boolean;
  chapters: ManifestChapter[];
  inputPath: string;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export class RunStore {
  runDir: string;

  constructor(runDir: string) {
    this.runDir = runDir;
  }

  exists(): boolean {
    return fs.existsSync(path.join(this.runDir, 'manifest.json'));
  }

  ensureDirs(): void {
    fs.mkdirSync(this.runDir, { recursive: true });
    fs.mkdirSync(this.chaptersDir, { recursive: true });
  }

  get chaptersDir(): string {
    return path.join(this.runDir, 'chapters');
  }

  get glossaryPath(): string {
    return path.join(this.runDir, 'glossary.db');
  }

  stageDocument(doc: Document, inputPath: string): Manifest {
    this.ensureDirs();
    const manifest: Manifest = {
      title: doc.title,
      sourceLang: doc.sourceLang,
      targetLang: doc.targetLang,
      fmt: doc.fmt,
      initialized: false,
      inputPath,
      chapters: doc.chapters.map((ch) => ({
        index: ch.index,
        title: ch.title,
        titleTranslated: ch.titleTranslated,
        status: STATUS_PENDING,
      })),
    };
    this.saveManifest(manifest);
    for (const ch of doc.chapters) {
      this.saveChapter(ch);
    }
    return manifest;
  }

  loadManifest(): Manifest {
    const p = path.join(this.runDir, 'manifest.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Manifest;
  }

  saveManifest(manifest: Manifest): void {
    const p = path.join(this.runDir, 'manifest.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  saveChapter(ch: Chapter): void {
    const p = path.join(this.chaptersDir, `${ch.index}.json`);
    fs.writeFileSync(p, JSON.stringify(ch, null, 2), 'utf-8');
  }

  loadChapter(index: number): Chapter {
    const p = path.join(this.chaptersDir, `${index}.json`);
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Chapter;
  }

  saveAnalysis(analysis: Record<string, unknown>): void {
    const p = path.join(this.runDir, 'analysis.json');
    fs.writeFileSync(p, JSON.stringify(analysis, null, 2), 'utf-8');
  }

  loadAnalysis(): Record<string, unknown> | undefined {
    const p = path.join(this.runDir, 'analysis.json');
    if (!fs.existsSync(p)) return undefined;
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  }

  saveContext(ctx: Record<string, unknown>): void {
    const p = path.join(this.runDir, 'context.json');
    fs.writeFileSync(p, JSON.stringify(ctx, null, 2), 'utf-8');
  }

  loadContext(): Record<string, unknown> | undefined {
    const p = path.join(this.runDir, 'context.json');
    if (!fs.existsSync(p)) return undefined;
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  }

  saveUsage(usage: UsageSummary): void {
    const p = path.join(this.runDir, 'usage.json');
    fs.writeFileSync(p, JSON.stringify(usage, null, 2), 'utf-8');
  }

  loadUsage(): UsageSummary | undefined {
    const p = path.join(this.runDir, 'usage.json');
    if (!fs.existsSync(p)) return undefined;
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as UsageSummary;
  }

  logEvent(event: string, data: Record<string, unknown> = {}): void {
    const p = path.join(this.runDir, 'events.log');
    const line = JSON.stringify({ t: new Date().toISOString(), event, ...data }) + '\n';
    fs.appendFileSync(p, line, 'utf-8');
  }

  async lock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = path.join(this.runDir, '.lock');
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    } catch {
      // ignore lock contention in MVP
    }
    try {
      return await fn();
    } finally {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  }
}
