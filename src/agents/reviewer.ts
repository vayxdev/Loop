import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

export interface ReviewIssue {
  index: number;
  type: 'missing' | 'added' | 'mistranslation' | 'terminology' | 'pronoun';
  detail: string;
  suggestion: string;
}

export class Reviewer extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async review(sources: string[], targets: string[], glossaryTerms: GlossaryTerm[] = []): Promise<ReviewIssue[]> {
    if (!sources.length) return [];
    const n = sources.length;
    const system = prompts.render('reviewer_system', {
      src: this.src,
      tgt: this.tgt,
    });
    const user = prompts.render('reviewer_user', {
      n,
      glossary: prompts.renderGlossary(glossaryTerms),
      pairs: prompts.numberedPairs(sources, targets),
    });
    const data = await this.askJson<{ issues?: unknown[] }>(system, user, {
      tier: 'strong',
      defaultValue: { issues: [] },
    });
    const issues: ReviewIssue[] = [];
    for (const item of Agent.dictItems(data.issues)) {
      const idx = typeof item.index === 'number' ? item.index : Number(item.index);
      const type = String(item.type || 'mistranslation');
      if (!Number.isFinite(idx)) continue;
      issues.push({
        index: idx,
        type: type as ReviewIssue['type'],
        detail: String(item.detail || ''),
        suggestion: String(item.suggestion || ''),
      });
    }
    return issues;
  }
}

export class BackTranslator extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async backtranslate(targets: string[]): Promise<string[]> {
    if (!targets.length) return [];
    const n = targets.length;
    const system = prompts.render('backtranslate_system', { src_label: this.src });
    const user = prompts.render('backtranslate_user', {
      n,
      numbered_target: prompts.numbered(targets),
    });
    const items = await this.askJson<unknown[]>(system, user, {
      tier: 'cheap',
      key: 'backtranslations',
      defaultValue: [],
    });
    if (Array.isArray(items) && items.length === n) {
      return items.map((x) => String(x));
    }
    return [];
  }
}
