import type { Config } from '../config/types.js';
import type { GlossaryTerm } from '../glossary/types.js';
import type { LLMClient } from '../llm/types.js';
import { Agent } from './base.js';
import * as prompts from './prompts.js';

export interface TerminologyIssue {
  type: 'terminology' | 'entity' | 'missing' | 'format';
  detail: string;
  where: string;
}

export class TerminologyValidator extends Agent {
  constructor(client: LLMClient, config: Config) {
    super(client, config);
  }

  async validate(targetText: string, glossaryTerms: GlossaryTerm[]): Promise<TerminologyIssue[]> {
    if (!targetText.trim() || this.config.profile !== 'nonfiction') return [];
    const system = prompts.render('terminology_validator_system', { src: this.src, tgt: this.tgt });
    const user = prompts.render('terminology_validator_user', {
      src: this.src,
      tgt: this.tgt,
      glossary: prompts.renderGlossary(glossaryTerms),
      target: targetText,
    });
    const data = await this.askJson<{ issues?: unknown[] } | null>(system, user, {
      tier: 'cheap',
      key: 'issues',
      defaultValue: { issues: [] },
    });
    const issues: TerminologyIssue[] = [];
    for (const item of Agent.dictItems(data?.issues)) {
      const type = String(item.type || 'terminology');
      issues.push({
        type: type as TerminologyIssue['type'],
        detail: String(item.detail || ''),
        where: String(item.where || ''),
      });
    }
    return issues;
  }
}
