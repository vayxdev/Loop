import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

export class TitleTranslator extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async translate(titles: string[], glossaryTerms: GlossaryTerm[] = []): Promise<string[]> {
    if (!titles.length) return [];
    const n = titles.length;
    const system = prompts.render('title_translator_system', {
      src: this.src,
      punct_rule: prompts.punctRule(),
    });
    const user = prompts.render('title_translator_user', {
      n,
      glossary: prompts.renderGlossary(glossaryTerms),
      numbered_titles: prompts.numbered(titles),
    });
    const items = await this.askJson<unknown[]>(system, user, {
      tier: 'strong',
      key: 'titles',
      defaultValue: [],
    });
    if (Array.isArray(items) && items.length === n) {
      return items.map((x) => String(x));
    }
    return [...titles];
  }
}
