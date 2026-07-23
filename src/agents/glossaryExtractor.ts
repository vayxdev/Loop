import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

function text(value: unknown, defaultValue = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return defaultValue;
}

export class GlossaryExtractor extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async extract(sourceText: string, targetText: string, existing: GlossaryTerm[]): Promise<GlossaryTerm[]> {
    const sys = prompts.render('glossary_extractor_system', {
      src: this.src,
    });
    const user = prompts.render('glossary_extractor_user', {
      src_label: this.src,
      glossary: prompts.renderGlossary(existing),
      source: sourceText,
      target: targetText,
    });
    const data = await this.askJson<{ terms?: unknown[] }>(sys, user, {
      tier: 'fast',
      key: 'terms',
      defaultValue: { terms: [] },
    });
    const terms: GlossaryTerm[] = [];
    for (const d of Agent.dictItems(data.terms)) {
      const source = text(d.source);
      const target = text(d.target);
      if (!source || !target) continue;
      const rawAliases = d.aliases;
      const aliases = Array.isArray(rawAliases) ? rawAliases.map((a) => text(a)).filter(Boolean) : [];
      const gender = text(d.gender);
      terms.push({
        source,
        target,
        reading: text(d.reading),
        type: text(d.type, '术语'),
        gender: gender === '未知' ? undefined : gender,
        aliases,
        note: text(d.note),
      });
    }
    return terms;
  }
}
