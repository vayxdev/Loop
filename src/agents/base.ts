import type { Config } from '../config/types.js';
import type { LLMClient, Message } from '../llm/types.js';

const RAISE = Symbol('raise');

export class Agent {
  protected client: LLMClient;
  protected config: Config;
  public src: string;
  public tgt: string;

  constructor(client: LLMClient, config: Config) {
    this.client = client;
    this.config = config;
    this.src = config.sourceLang;
    this.tgt = config.targetLang;
  }

  protected async askJson<T>(
    system: string,
    user: string,
    options: { tier: string; key?: string; defaultValue?: T; maxTokens?: number },
  ): Promise<T> {
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    try {
      const data = await this.client.completeJson<unknown>(messages, {
        tier: options.tier,
        maxTokens: options.maxTokens,
        stage: this.constructor.name,
      });
      if (options.key && data && typeof data === 'object') {
        const v = (data as Record<string, unknown>)[options.key];
        return v as T;
      }
      return data as T;
    } catch (err) {
      if (options.defaultValue !== undefined) {
        return options.defaultValue;
      }
      throw err;
    }
  }

  protected async askText(system: string, user: string, options: { tier: string; maxTokens?: number; defaultValue?: string }): Promise<string> {
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    try {
      const text = await this.client.complete(messages, {
        tier: options.tier,
        maxTokens: options.maxTokens,
        stage: this.constructor.name,
      });
      return text.trim();
    } catch (err) {
      if (options.defaultValue !== undefined) {
        return options.defaultValue;
      }
      throw err;
    }
  }

  protected static dictItems(items: unknown): Record<string, unknown>[] {
    if (!Array.isArray(items)) return [];
    return items.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null);
  }
}
