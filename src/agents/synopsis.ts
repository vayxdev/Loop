import type { Config } from '../config/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

const REDUCE_BUDGET = 12000;

export class Synopsizer extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async digestChapter(sourceText: string): Promise<string> {
    if (!sourceText.trim()) return '';
    const system = prompts.render('chapter_digest_system', { src: this.src });
    const user = prompts.render('chapter_digest_user', { src: this.src, source: sourceText.slice(0, 8000) });
    return this.askText(system, user, { tier: 'fast', maxTokens: 600, defaultValue: '' });
  }

  async bookSynopsis(digests: string[], analysisBrief: string): Promise<string> {
    let items = digests.map((d) => d.trim()).filter(Boolean);
    if (!items.length) return '';
    while (true) {
      const groups = this.group(items, REDUCE_BUDGET);
      if (groups.length === 1) {
        return this.synth(groups[0], analysisBrief);
      }
      items = (await Promise.all(groups.map((g) => this.synth(g, analysisBrief))))
        .map((s) => s.trim())
        .filter(Boolean);
      if (!items.length) return '';
    }
  }

  private group(items: string[], budget: number): string[][] {
    const groups: string[][] = [];
    let cur: string[] = [];
    let size = 0;
    for (const it of items) {
      if (cur.length && size + it.length > budget) {
        groups.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(it);
      size += it.length + 1;
    }
    if (cur.length) groups.push(cur);
    return groups;
  }

  private async synth(digests: string[], analysisBrief: string): Promise<string> {
    const numbered = digests.map((d, i) => `[${i}] ${d}`).join('\n');
    const system = prompts.render('book_synopsis_system', { src: this.src });
    const user = prompts.render('book_synopsis_user', {
      analysis: analysisBrief || '（无）',
      digests: numbered,
    });
    return this.askText(system, user, { tier: 'fast', maxTokens: 1200, defaultValue: '' });
  }
}
