// @ts-nocheck
/** Bun-compatible GlossaryStore using bun:sqlite.
 *
 * This file is only used when compiling with `bun build --compile`.
 * The regular Node build uses store.ts (better-sqlite3).
 */
import type { GlossaryTerm } from './types.js';

const TYPE_PERSON = '人物';
const TYPE_PLACE = '地名';
const TYPE_ORG = '组织';
const TYPE_TERM = '术语';
const TYPE_SKILL = '招式';
const TYPE_APPELLATION = '称谓';
const TYPE_HONORIFIC = '敬称';
const TYPE_SPEECH = '口癖';
const TYPE_FIXED_EXPR = '固定表达';
const TYPE_CONCEPT = '概念';
const TYPE_WORK = '著作';
const TYPE_EVENT = '事件';
const TYPE_LAW = '法案';
const TYPE_SCHOOL = '学派';

const ALL_TYPES = [
  TYPE_PERSON,
  TYPE_PLACE,
  TYPE_ORG,
  TYPE_TERM,
  TYPE_SKILL,
  TYPE_APPELLATION,
  TYPE_HONORIFIC,
  TYPE_SPEECH,
  TYPE_FIXED_EXPR,
  TYPE_CONCEPT,
  TYPE_WORK,
  TYPE_EVENT,
  TYPE_LAW,
  TYPE_SCHOOL,
];

const SOURCE_ONLY_TYPES = new Set([TYPE_APPELLATION, TYPE_HONORIFIC, TYPE_SPEECH, TYPE_FIXED_EXPR]);

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

function hash(text: string): string {
  return Buffer.from(text.trim()).toString('base64');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS glossary (
    source        TEXT PRIMARY KEY,
    target        TEXT NOT NULL,
    reading       TEXT,
    type          TEXT,
    gender        TEXT,
    aliases       TEXT,
    first_chapter INTEGER,
    note          TEXT,
    status        TEXT DEFAULT 'ok',
    updated_at    REAL
);

CREATE TABLE IF NOT EXISTS term_conflicts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT NOT NULL,
    existing_target TEXT,
    proposed_target TEXT,
    chapter         INTEGER,
    note            TEXT,
    resolved        INTEGER DEFAULT 0,
    created_at      REAL
);

CREATE TABLE IF NOT EXISTS translation_memory (
    source_hash TEXT PRIMARY KEY,
    source_text TEXT NOT NULL,
    target_text TEXT NOT NULL,
    chapter     INTEGER,
    updated_at  REAL
);
`;

export class GlossaryStore {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    const { Database } = require('bun:sqlite');
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  getTerm(source: string): GlossaryTerm | undefined {
    const row = this.db.query('SELECT * FROM glossary WHERE source = ?').get(source) as Record<string, unknown> | undefined;
    return row ? this.rowToTerm(row) : undefined;
  }

  upsertTerm(term: GlossaryTerm, chapter?: number): 'inserted' | 'unchanged' | 'conflict' {
    const existing = this.getTerm(term.source);
    const now = Date.now() / 1000;
    if (!existing) {
      this.db.run(
        `INSERT INTO glossary
         (source, target, reading, type, gender, aliases, first_chapter, note, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        term.source,
        term.target,
        term.reading || null,
        term.type || TYPE_TERM,
        term.gender || null,
        JSON.stringify(term.aliases || []),
        term.firstChapter ?? chapter ?? null,
        term.note || null,
        'ok',
        now,
      );
      return 'inserted';
    }
    if (existing.target === term.target) {
      const merged = Array.from(new Set([...(existing.aliases || []), ...(term.aliases || [])]));
      this.db.run(
        `UPDATE glossary SET reading=COALESCE(?, reading),
         gender=COALESCE(?, gender), aliases=?, note=COALESCE(?, note), updated_at=?
         WHERE source=?`,
        term.reading || null,
        term.gender || null,
        JSON.stringify(merged),
        term.note || null,
        now,
        term.source,
      );
      return 'unchanged';
    }
    this.logConflict(term.source, existing.target, term.target, chapter);
    this.db.run("UPDATE glossary SET status='conflict', updated_at=? WHERE source=?", now, term.source);
    return 'conflict';
  }

  private logConflict(source: string, existing: string, proposed: string, chapter?: number): void {
    this.db.run(
      `INSERT INTO term_conflicts
       (source, existing_target, proposed_target, chapter, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      source,
      existing,
      proposed,
      chapter ?? null,
      Date.now() / 1000,
    );
  }

  allTerms(): GlossaryTerm[] {
    const rows = this.db.query('SELECT * FROM glossary ORDER BY type, source').all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToTerm(r));
  }

  static termsIn(terms: GlossaryTerm[], text: string): GlossaryTerm[] {
    const normalized = normalizeText(text);
    return terms.filter((term) => {
      const keys = SOURCE_ONLY_TYPES.has(term.type) ? [term.source] : [term.source, ...(term.aliases || [])];
      return keys.some((k) => k && normalized.includes(normalizeText(k)));
    });
  }

  termsInText(text: string): GlossaryTerm[] {
    return GlossaryStore.termsIn(this.allTerms(), text);
  }

  openConflicts(): Array<Record<string, unknown>> {
    return this.db.query('SELECT * FROM term_conflicts WHERE resolved=0 ORDER BY created_at').all() as Array<
      Record<string, unknown>
    >;
  }

  resolveTerm(source: string, target: string): boolean {
    const info = this.db.run(
      "UPDATE glossary SET target=?, status='ok', updated_at=? WHERE source=?",
      target,
      Date.now() / 1000,
      source,
    );
    return info.changes > 0;
  }

  markConflictsResolved(source: string): void {
    this.db.run('UPDATE term_conflicts SET resolved=1 WHERE source=?', source);
  }

  addTm(sourceText: string, targetText: string, chapter?: number): void {
    const h = hash(sourceText);
    this.db.run(
      `INSERT INTO translation_memory (source_hash, source_text, target_text, chapter, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source_hash) DO UPDATE SET target_text=excluded.target_text,
           chapter=excluded.chapter, updated_at=excluded.updated_at`,
      h,
      sourceText,
      targetText,
      chapter ?? null,
      Date.now() / 1000,
    );
  }

  tmLookup(sourceText: string): string | undefined {
    const h = hash(sourceText);
    const row = this.db.query('SELECT target_text FROM translation_memory WHERE source_hash=?').get(h) as
      | { target_text: string }
      | undefined;
    return row?.target_text;
  }

  stats(): { terms: number; openConflicts: number; tmEntries: number } {
    const g = (this.db.query('SELECT COUNT(*) AS c FROM glossary').get() as { c: number }).c;
    const c = (this.db.query('SELECT COUNT(*) AS c FROM term_conflicts WHERE resolved=0').get() as { c: number }).c;
    const t = (this.db.query('SELECT COUNT(*) AS c FROM translation_memory').get() as { c: number }).c;
    return { terms: g, openConflicts: c, tmEntries: t };
  }

  private rowToTerm(row: Record<string, unknown>): GlossaryTerm {
    let aliases: string[] = [];
    try {
      aliases = JSON.parse((row.aliases as string) || '[]');
    } catch {
      aliases = [];
    }
    return {
      source: String(row.source),
      target: String(row.target),
      reading: (row.reading as string) || undefined,
      type: (row.type as string) || TYPE_TERM,
      gender: (row.gender as string) || undefined,
      aliases,
      firstChapter: row.first_chapter === null ? undefined : Number(row.first_chapter),
      note: (row.note as string) || undefined,
      status: (row.status as 'ok' | 'conflict') || 'ok',
      keepOriginal: undefined,
    };
  }
}

export { ALL_TYPES, TYPE_PERSON, TYPE_PLACE, TYPE_ORG, TYPE_TERM, TYPE_SKILL };
