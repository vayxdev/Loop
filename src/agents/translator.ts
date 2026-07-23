import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

export class AlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlignmentError';
  }
}

export class Translator extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  private async callBatch(
    sources: string[],
    glossaryTerms: GlossaryTerm[],
    style: string,
    context: string,
    bookSynopsis: string,
    chapterDigest: string,
  ): Promise<string[]> {
    const n = sources.length;
    const sys = prompts.render('translator_system', { src: this.src, tgt: this.tgt, honorific_strategy: this.config.honorificStrategy, ...prompts.translatorSystemVars(this.src, this.tgt, this.config.honorificStrategy) });
    const user = prompts.render('translator_user', {
      src: this.src,
      style: style || '（无）',
      book_synopsis: bookSynopsis || '（无）',
      chapter_digest: chapterDigest || '（无）',
      glossary: prompts.renderGlossary(glossaryTerms),
      context: context || '（无）',
      n,
      n_minus_1: n - 1,
      numbered_source: prompts.numbered(sources),
    });
    const items = await this.askJson<unknown[]>(sys, user, { tier: 'strong', key: 'translations' });
    if (!Array.isArray(items)) throw new AlignmentError('模型未返回译文数组');
    if (items.length !== n) throw new AlignmentError(`译文数量不匹配：期望 ${n} 段，实际 ${items.length} 段`);
    if (items.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new AlignmentError('模型返回了空译文或非字符串译文');
    }
    return items as string[];
  }

  private async translateOne(
    source: string,
    glossaryTerms: GlossaryTerm[],
    style: string,
    context: string,
    bookSynopsis: string,
    chapterDigest: string,
  ): Promise<string> {
    const out = await this.callBatch([source], glossaryTerms, style, context, bookSynopsis, chapterDigest);
    return out[0];
  }

  async translateBatch(
    sources: string[],
    options: {
      glossaryTerms?: GlossaryTerm[];
      style?: string;
      context?: string;
      bookSynopsis?: string;
      chapterDigest?: string;
    },
  ): Promise<string[]> {
    const glossaryTerms = options.glossaryTerms || [];
    const n = sources.length;
    if (n === 0) return [];
    const attempts = this.config.pipeline.alignRetryLimit + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.callBatch(
          sources,
          glossaryTerms,
          options.style || '',
          options.context || '',
          options.bookSynopsis || '',
          options.chapterDigest || '',
        );
      } catch {
        // retry
      }
    }
    const targets: string[] = [];
    for (let i = 0; i < sources.length; i++) {
      try {
        const t = await this.translateOne(
          sources[i],
          glossaryTerms,
          options.style || '',
          options.context || '',
          options.bookSynopsis || '',
          options.chapterDigest || '',
        );
        targets.push(t);
      } catch (err) {
        throw new AlignmentError(`逐段兜底翻译在第 ${i} 段失败: ${(err as Error).message}`);
      }
    }
    return targets;
  }

  async retranslateWithFeedback(
    source: string,
    options: {
      feedback: string;
      glossaryTerms?: GlossaryTerm[];
      style?: string;
      contextBefore?: string;
      contextAfter?: string;
      bookSynopsis?: string;
      chapterDigest?: string;
    },
  ): Promise<string> {
    const sys = prompts.render('translator_system', { src: this.src, tgt: this.tgt, honorific_strategy: this.config.honorificStrategy, ...prompts.translatorSystemVars(this.src, this.tgt, this.config.honorificStrategy) });
    const user = prompts.render('translator_fix_user', {
      src: this.src,
      style: options.style || '（无）',
      book_synopsis: options.bookSynopsis || '（无）',
      chapter_digest: options.chapterDigest || '（无）',
      glossary: prompts.renderGlossary(options.glossaryTerms || []),
      context_before: options.contextBefore || '（无）',
      context_after: options.contextAfter || '（无）',
      feedback: options.feedback || '（无）',
      source,
    });
    const items = await this.askJson<unknown[]>(sys, user, {
      tier: 'strong',
      key: 'translations',
      defaultValue: [],
    });
    if (Array.isArray(items) && items.length > 0 && typeof items[0] === 'string') {
      return items[0].trim();
    }
    return '';
  }
}
