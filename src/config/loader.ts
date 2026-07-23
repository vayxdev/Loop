import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { DEFAULT_CONFIG, defaultConfigYaml } from './default.js';
import type { Config, LLMConfig, NonfictionConfig, OutputConfig, PipelineConfig, SegmentConfig, TierConfig } from './types.js';

export function loadConfig(filePath = 'config.yaml'): Config {
  let raw: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    raw = (yaml.load(content) as Record<string, unknown>) || {};
  }
  return fromDict(raw);
}

export function fromDict(raw: Record<string, unknown>): Config {
  const lang = (raw.language as Record<string, unknown>) || {};
  const llmRaw = (raw.llm as Record<string, unknown>) || {};
  const segmentRaw = (raw.segment as Record<string, unknown>) || {};
  const pipelineRaw = (raw.pipeline as Record<string, unknown>) || {};
  const outputRaw = (raw.output as Record<string, unknown>) || {};
  const honorificRaw = (raw.honorific as Record<string, unknown>) || {};
  const punctRaw = (raw.punctuation as Record<string, unknown>) || {};
  const pathsRaw = (raw.paths as Record<string, unknown>) || {};
  const nonfictionRaw = (raw.nonfiction as Record<string, unknown>) || {};

  return {
    sourceLang: (lang.source as string) || DEFAULT_CONFIG.sourceLang,
    targetLang: (lang.target as string) || DEFAULT_CONFIG.targetLang,
    profile: (raw.profile as 'fiction' | 'nonfiction') || DEFAULT_CONFIG.profile,
    nonfiction: loadNonfiction(nonfictionRaw),
    llm: loadLLM(llmRaw),
    segment: loadSegment(segmentRaw),
    pipeline: loadPipeline(pipelineRaw),
    output: loadOutput(outputRaw),
    honorificStrategy: (honorificRaw.strategy as string) || DEFAULT_CONFIG.honorificStrategy,
    punctuationNormalize: punctRaw.normalize !== undefined ? Boolean(punctRaw.normalize) : DEFAULT_CONFIG.punctuationNormalize,
    stateDir: (pathsRaw.stateDir as string) || DEFAULT_CONFIG.stateDir,
  };
}

function loadLLM(raw: Record<string, unknown>): LLMConfig {
  const tiersRaw = (raw.tiers as Record<string, Record<string, unknown>>) || {};
  const tiers: Record<string, TierConfig> = {};
  for (const [name, t] of Object.entries(tiersRaw)) {
    tiers[name] = {
      model: (t.model as string) || '',
      options: (t.options as Record<string, unknown>) || {},
    };
  }
  return {
    provider: (raw.provider as string) || DEFAULT_CONFIG.llm.provider,
    baseUrl: (raw.baseUrl as string) || DEFAULT_CONFIG.llm.baseUrl,
    apiKeyEnv: (raw.apiKeyEnv as string) || DEFAULT_CONFIG.llm.apiKeyEnv,
    timeout: raw.timeout !== undefined ? Number(raw.timeout) : DEFAULT_CONFIG.llm.timeout,
    maxRetries: raw.maxRetries !== undefined ? Number(raw.maxRetries) : DEFAULT_CONFIG.llm.maxRetries,
    tiers,
  };
}

function loadSegment(raw: Record<string, unknown>): SegmentConfig {
  return {
    maxCharsPerBatch: raw.maxCharsPerBatch !== undefined ? Number(raw.maxCharsPerBatch) : DEFAULT_CONFIG.segment.maxCharsPerBatch,
    maxCharsPerSegment: raw.maxCharsPerSegment !== undefined ? Number(raw.maxCharsPerSegment) : DEFAULT_CONFIG.segment.maxCharsPerSegment,
  };
}

function loadPipeline(raw: Record<string, unknown>): PipelineConfig {
  return {
    review: raw.review !== undefined ? Boolean(raw.review) : DEFAULT_CONFIG.pipeline.review,
    autofixSevere: raw.autofixSevere !== undefined ? Boolean(raw.autofixSevere) : DEFAULT_CONFIG.pipeline.autofixSevere,
    alignRetryLimit: raw.alignRetryLimit !== undefined ? Number(raw.alignRetryLimit) : DEFAULT_CONFIG.pipeline.alignRetryLimit,
    polish: raw.polish !== undefined ? Boolean(raw.polish) : DEFAULT_CONFIG.pipeline.polish,
    backtranslateSample: raw.backtranslateSample !== undefined ? Number(raw.backtranslateSample) : DEFAULT_CONFIG.pipeline.backtranslateSample,
    consistencyQa: raw.consistencyQa !== undefined ? Boolean(raw.consistencyQa) : DEFAULT_CONFIG.pipeline.consistencyQa,
    rollingContextSegments: raw.rollingContextSegments !== undefined ? Number(raw.rollingContextSegments) : DEFAULT_CONFIG.pipeline.rollingContextSegments,
    bookUnderstanding: raw.bookUnderstanding !== undefined ? Boolean(raw.bookUnderstanding) : DEFAULT_CONFIG.pipeline.bookUnderstanding,
    prescanConcurrency: raw.prescanConcurrency !== undefined ? Number(raw.prescanConcurrency) : DEFAULT_CONFIG.pipeline.prescanConcurrency,
    reviewConcurrency: raw.reviewConcurrency !== undefined ? Number(raw.reviewConcurrency) : DEFAULT_CONFIG.pipeline.reviewConcurrency,
    glossaryScope: (raw.glossaryScope as 'chapter' | 'full') || DEFAULT_CONFIG.pipeline.glossaryScope,
  };
}

function loadNonfiction(raw: Record<string, unknown>): NonfictionConfig {
  return {
    domain: (raw.domain as string) || DEFAULT_CONFIG.nonfiction.domain,
    audience: (raw.audience as string) || DEFAULT_CONFIG.nonfiction.audience,
    firstOccurrenceWithOriginal:
      raw.firstOccurrenceWithOriginal !== undefined
        ? Boolean(raw.firstOccurrenceWithOriginal)
        : DEFAULT_CONFIG.nonfiction.firstOccurrenceWithOriginal,
  };
}

function loadOutput(raw: Record<string, unknown>): OutputConfig {
  return {
    mono: raw.mono !== undefined ? Boolean(raw.mono) : DEFAULT_CONFIG.output.mono,
    bilingual: raw.bilingual !== undefined ? Boolean(raw.bilingual) : DEFAULT_CONFIG.output.bilingual,
    bilingualOrder: (raw.bilingualOrder as 'target_first' | 'source_first') || DEFAULT_CONFIG.output.bilingualOrder,
    aboutPage: raw.aboutPage !== undefined ? Boolean(raw.aboutPage) : DEFAULT_CONFIG.output.aboutPage,
  };
}

export function ensureDefaultConfig(filePath = 'config.yaml'): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(path.resolve(filePath)) || '.', { recursive: true });
  fs.writeFileSync(filePath, defaultConfigYaml(), 'utf-8');
  return true;
}
