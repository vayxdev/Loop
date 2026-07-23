import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

export class Polisher extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async polish(targets: string[], options: { glossaryTerms?: GlossaryTerm[]; style?: string } = {}): Promise<string[]> {
    if (!targets.length) return [];
    const n = targets.length;
    const system = prompts.render('polisher_system', { src: this.src, tgt: this.tgt, punct_rule: prompts.punctRule() });
    const user = prompts.render('polisher_user', {
      style: options.style || '（无）',
      glossary: prompts.renderGlossary(options.glossaryTerms || []),
      n,
      numbered_target: prompts.numbered(targets),
    });
    const items = await this.askJson<unknown[]>(system, user, {
      tier: 'strong',
      key: 'polished',
      defaultValue: undefined,
    });
    if (Array.isArray(items) && items.length === n) {
      return items.map((x) => String(x));
    }
    return [...targets];
  }
}
