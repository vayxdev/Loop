import Database from 'better-sqlite3';
import type { GlossaryTerm } from './types.js';

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

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

const SOURCE_ONLY_TYPES = new Set(['称谓', '敬称', '口癖', '固定表达']);

export class GlossaryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  getTerm(source: string): GlossaryTerm | undefined {
    const row = this.db.prepare('SELECT * FROM glossary WHERE source = ?').get(source) as Record<string, unknown> | undefined;
    return row ? this.rowToTerm(row) : undefined;
  }

  upsertTerm(term: GlossaryTerm, chapter?: number): 'inserted' | 'unchanged' | 'conflict' {
    const existing = this.getTerm(term.source);
    const now = Date.now() / 1000;
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO glossary
           (source, target, reading, type, gender, aliases, first_chapter, note, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          term.source,
          term.target,
          term.reading || null,
          term.type || '术语',
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
      this.db
        .prepare(
          `UPDATE glossary SET reading=COALESCE(?, reading),
           gender=COALESCE(?, gender), aliases=?, note=COALESCE(?, note), updated_at=?
           WHERE source=?`,
        )
        .run(
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
    this.db.prepare("UPDATE glossary SET status='conflict', updated_at=? WHERE source=?").run(now, term.source);
    return 'conflict';
  }

  private logConflict(source: string, existing: string, proposed: string, chapter?: number): void {
    this.db
      .prepare(
        `INSERT INTO term_conflicts
         (source, existing_target, proposed_target, chapter, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(source, existing, proposed, chapter ?? null, Date.now() / 1000);
  }

  allTerms(): GlossaryTerm[] {
    const rows = this.db.prepare('SELECT * FROM glossary ORDER BY type, source').all() as Record<string, unknown>[];
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
    return this.db.prepare('SELECT * FROM term_conflicts WHERE resolved=0 ORDER BY created_at').all() as Array<
      Record<string, unknown>
    >;
  }

  resolveTerm(source: string, target: string): boolean {
    const info = this.db
      .prepare("UPDATE glossary SET target=?, status='ok', updated_at=? WHERE source=?")
      .run(target, Date.now() / 1000, source);
    return info.changes > 0;
  }

  markConflictsResolved(source: string): void {
    this.db.prepare('UPDATE term_conflicts SET resolved=1 WHERE source=?').run(source);
  }

  addTm(sourceText: string, targetText: string, chapter?: number): void {
    const hash = Buffer.from(sourceText.trim()).toString('base64');
    this.db
      .prepare(
        `INSERT INTO translation_memory (source_hash, source_text, target_text, chapter, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_hash) DO UPDATE SET target_text=excluded.target_text,
             chapter=excluded.chapter, updated_at=excluded.updated_at`,
      )
      .run(hash, sourceText, targetText, chapter ?? null, Date.now() / 1000);
  }

  tmLookup(sourceText: string): string | undefined {
    const hash = Buffer.from(sourceText.trim()).toString('base64');
    const row = this.db.prepare('SELECT target_text FROM translation_memory WHERE source_hash=?').get(hash) as
      | { target_text: string }
      | undefined;
    return row?.target_text;
  }

  stats(): { terms: number; openConflicts: number; tmEntries: number } {
    const terms = (this.db.prepare('SELECT COUNT(*) AS c FROM glossary').get() as { c: number }).c;
    const openConflicts = (this.db.prepare('SELECT COUNT(*) AS c FROM term_conflicts WHERE resolved=0').get() as { c: number }).c;
    const tmEntries = (this.db.prepare('SELECT COUNT(*) AS c FROM translation_memory').get() as { c: number }).c;
    return { terms, openConflicts, tmEntries };
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
      type: (row.type as string) || '术语',
      gender: (row.gender as string) || undefined,
      aliases,
      firstChapter: row.first_chapter === null ? undefined : Number(row.first_chapter),
      note: (row.note as string) || undefined,
      status: (row.status as 'ok' | 'conflict') || 'ok',
    };
  }
}
