export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMClient {
  complete(messages: Message[], options: { tier: string; maxTokens?: number; stage?: string }): Promise<string>;
  completeJson<T = unknown>(messages: Message[], options: { tier: string; maxTokens?: number; stage?: string }): Promise<T>;
  usageSummary(): UsageSummary;
}
