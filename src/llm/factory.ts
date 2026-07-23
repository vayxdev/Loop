import type { Config } from '../config/types.js';
import type { LLMClient } from './types.js';
import { OpenAICompatibleClient } from './client.js';
import { FakeClient } from './providers/fake.js';

export function buildClient(config: Config): LLMClient {
  const provider = config.llm.provider;
  if (provider === 'fake') {
    return new FakeClient();
  }
  // All providers we support are OpenAI-compatible in this MVP
  return new OpenAICompatibleClient(config);
}
