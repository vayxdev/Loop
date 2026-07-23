import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

function text(value: unknown, defaultValue = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
  return defaultValue;
}

export interface FictionAnalysisResult {
  profile: 'fiction';
  genre: string;
  tone: string;
  styleGuide: string;
  narration: string;
  pacing: string;
  register: string;
  dialogueStyle: string;
  rhetoric: string;
  characters: Array<Record<string, unknown>>;
  terms: Array<Record<string, unknown>>;
}

export interface NonfictionAnalysisResult {
  profile: 'nonfiction';
  domain: string;
  audience: string;
  translationConventions: string[];
  styleGuide: string;
  keyConcepts: Array<Record<string, unknown>>;
  keyEntities: Array<Record<string, unknown>>;
}

export type AnalysisResult = FictionAnalysisResult | NonfictionAnalysisResult;

export class Analyzer extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async analyze(sampleText: string): Promise<Partial<AnalysisResult>> {
    if (!sampleText.trim()) return {};
    const system = prompts.render('analyzer_system', { src: this.src, tgt: this.tgt, ...prompts.analyzerSystemVars(this.src, this.tgt) });
    const user = prompts.render('analyzer_user', { src: this.src, sample: sampleText });
    const data = (await this.askJson<Record<string, unknown>>(system, user, { tier: 'strong' })) || {};

    if (this.config.profile === 'nonfiction') {
      return {
        profile: 'nonfiction',
        domain: text(data.domain),
        audience: text(data.audience),
        translationConventions: Agent.dictItems(data.translation_conventions as unknown[]).map((d) => text(d.text || d)),
        styleGuide: text(data.style_guide),
        keyConcepts: Agent.dictItems(data.key_concepts),
        keyEntities: Agent.dictItems(data.key_entities),
      } as Partial<NonfictionAnalysisResult>;
    }

    return {
      profile: 'fiction',
      genre: text(data.genre),
      tone: text(data.tone),
      styleGuide: text(data.style_guide),
      narration: text(data.narration),
      pacing: text(data.pacing),
      register: text(data.register),
      dialogueStyle: text(data.dialogue_style),
      rhetoric: text(data.rhetoric),
      characters: Agent.dictItems(data.characters),
      terms: Agent.dictItems(data.terms),
    } as Partial<FictionAnalysisResult>;
  }

  seedGlossary(analysis: Partial<AnalysisResult>): GlossaryTerm[] {
    if (analysis.profile === 'nonfiction') {
      return this.seedNonfictionGlossary(analysis as Partial<NonfictionAnalysisResult>);
    }
    return this.seedFictionGlossary(analysis as Partial<FictionAnalysisResult>);
  }

  private seedFictionGlossary(analysis: Partial<FictionAnalysisResult>): GlossaryTerm[] {
    const terms: GlossaryTerm[] = [];
    for (const ch of analysis.characters || []) {
      const source = text(ch.source);
      const target = text(ch.target);
      if (!source || !target) continue;
      terms.push({
        source,
        target,
        reading: text(ch.reading),
        type: '人物',
        gender: text(ch.gender),
        note: text(ch.note),
        firstChapter: 0,
        status: 'ok',
      });
    }
    for (const tm of analysis.terms || []) {
      const source = text(tm.source);
      const target = text(tm.target);
      if (!source || !target) continue;
      terms.push({
        source,
        target,
        reading: text(tm.reading),
        type: text(tm.type, '术语'),
        note: text(tm.note),
        firstChapter: 0,
        status: 'ok',
      });
    }
    return terms;
  }

  private seedNonfictionGlossary(analysis: Partial<NonfictionAnalysisResult>): GlossaryTerm[] {
    const terms: GlossaryTerm[] = [];
    const keepOriginal = this.config.nonfiction.firstOccurrenceWithOriginal;
    for (const c of analysis.keyConcepts || []) {
      const source = text(c.source);
      const target = text(c.target);
      if (!source || !target) continue;
      terms.push({
        source,
        target,
        reading: text(c.reading),
        type: text(c.type, '概念'),
        note: text(c.note),
        firstChapter: 0,
        status: 'ok',
        keepOriginal,
      });
    }
    for (const e of analysis.keyEntities || []) {
      const source = text(e.source);
      const target = text(e.target);
      if (!source || !target) continue;
      terms.push({
        source,
        target,
        reading: text(e.reading),
        type: text(e.type, '术语'),
        note: text(e.note),
        firstChapter: 0,
        status: 'ok',
        keepOriginal,
      });
    }
    return terms;
  }

  styleBrief(analysis: Partial<AnalysisResult>): string {
    if (analysis.profile === 'nonfiction') {
      return this.nonfictionStyleBrief(analysis as Partial<NonfictionAnalysisResult>);
    }
    return this.fictionStyleBrief(analysis as Partial<FictionAnalysisResult>);
  }

  private fictionStyleBrief(analysis: Partial<FictionAnalysisResult>): string {
    const lines: string[] = [];
    if (analysis.genre) lines.push(`体裁：${analysis.genre}`);
    if (analysis.tone) lines.push(`语气文体：${analysis.tone}`);
    if (analysis.styleGuide) lines.push(`风格指南：${analysis.styleGuide}`);
    const dims: Array<[keyof FictionAnalysisResult, string]> = [
      ['narration', '叙事'],
      ['pacing', '句式节奏'],
      ['register', '语域'],
      ['dialogueStyle', '对话风格'],
      ['rhetoric', '修辞'],
    ];
    for (const [key, label] of dims) {
      const v = analysis[key];
      if (typeof v === 'string' && v) lines.push(`${label}：${v}`);
    }
    const chars = analysis.characters || [];
    if (chars.length) {
      lines.push('角色：');
      for (const c of chars) {
        const gender = c.gender ? `，${c.gender}` : '';
        const note = c.note ? `，${c.note}` : '';
        lines.push(`  - ${c.target || c.source}(${c.source}${gender}${note})`);
      }
    }
    return lines.join('\n');
  }

  private nonfictionStyleBrief(analysis: Partial<NonfictionAnalysisResult>): string {
    const lines: string[] = [];
    if (analysis.domain) lines.push(`领域：${analysis.domain}`);
    if (analysis.audience) lines.push(`目标读者：${analysis.audience}`);
    if (analysis.styleGuide) lines.push(`风格指南：${analysis.styleGuide}`);
    if (analysis.translationConventions?.length) {
      lines.push('翻译惯例：');
      for (const c of analysis.translationConventions) {
        lines.push(`  - ${c}`);
      }
    }
    return lines.join('\n');
  }
}
