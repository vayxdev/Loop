import OpenAI from 'openai';
import type { LLMClient, Message, UsageSummary } from './types.js';
import { emptyUsage, mergeUsage } from './usage.js';
import type { Config } from '../config/types.js';

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const arrStart = trimmed.indexOf('[');
  if (start === -1 && arrStart === -1) return trimmed;
  const s = start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = s;
  const open = trimmed[s];
  const close = open === '{' ? '}' : ']';
  for (let i = s; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return trimmed.slice(s, end + 1);
}

export class OpenAICompatibleClient implements LLMClient {
  private openai: OpenAI;
  private config: Config;
  private usage: UsageSummary = emptyUsage();

  constructor(config: Config) {
    this.config = config;
    const apiKey = config.llm.apiKeyEnv ? process.env[config.llm.apiKeyEnv] : process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(`Missing API key: set ${config.llm.apiKeyEnv || 'OPENAI_API_KEY'}`);
    }
    this.openai = new OpenAI({ apiKey, baseURL: config.llm.baseUrl, timeout: (config.llm.timeout || 600) * 1000, maxRetries: config.llm.maxRetries || 4 });
  }

  private getModel(tier: string): { model: string; options?: Record<string, unknown> } {
    const t = this.config.llm.tiers[tier] || this.config.llm.tiers.strong || Object.values(this.config.llm.tiers)[0];
    if (!t) throw new Error(`No LLM tier configured for tier=${tier}`);
    return t;
  }

  async complete(messages: Message[], options: { tier: string; maxTokens?: number; stage?: string }): Promise<string> {
    const tier = this.getModel(options.tier);
    const completion = await this.openai.chat.completions.create({
      model: tier.model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens,
      ...(tier.options || {}),
    });
    const content = completion.choices[0]?.message?.content || '';
    const usage = completion.usage;
    if (usage) {
      this.usage = mergeUsage(this.usage, {
        calls: 1,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      });
    }
    return content;
  }

  async completeJson<T = unknown>(messages: Message[], options: { tier: string; maxTokens?: number; stage?: string }): Promise<T> {
    const text = await this.complete(messages, options);
    const jsonText = extractJson(text);
    try {
      return JSON.parse(jsonText) as T;
    } catch (err) {
      throw new Error(`Failed to parse JSON from ${options.stage || 'unknown'}: ${(err as Error).message}\nRaw: ${text}`);
    }
  }

  usageSummary(): UsageSummary {
    return { ...this.usage };
  }
}
