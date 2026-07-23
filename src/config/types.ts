export interface TierConfig {
  model: string;
  options?: Record<string, unknown>;
}

export interface LLMConfig {
  provider: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  timeout?: number;
  maxRetries?: number;
  tiers: Record<string, TierConfig>;
}

export interface SegmentConfig {
  maxCharsPerBatch: number;
  maxCharsPerSegment: number;
}

export interface PipelineConfig {
  review: boolean;
  autofixSevere: boolean;
  alignRetryLimit: number;
  polish: boolean;
  backtranslateSample: number;
  consistencyQa: boolean;
  rollingContextSegments: number;
  bookUnderstanding: boolean;
  prescanConcurrency: number;
  reviewConcurrency: number;
  glossaryScope: 'chapter' | 'full';
}

export interface OutputConfig {
  mono: boolean;
  bilingual: boolean;
  bilingualOrder: 'target_first' | 'source_first';
  aboutPage: boolean;
}

export interface NonfictionConfig {
  domain: string;
  audience: string;
  firstOccurrenceWithOriginal: boolean;
}

export interface Config {
  sourceLang: string;
  targetLang: string;
  profile: 'fiction' | 'nonfiction';
  nonfiction: NonfictionConfig;
  llm: LLMConfig;
  segment: SegmentConfig;
  pipeline: PipelineConfig;
  output: OutputConfig;
  honorificStrategy: string;
  punctuationNormalize: boolean;
  stateDir: string;
}
