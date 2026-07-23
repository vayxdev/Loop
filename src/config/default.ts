import type { Config } from './types.js';

export const DEFAULT_CONFIG: Config = {
  sourceLang: 'auto',
  targetLang: 'zh',
  profile: 'fiction',
  nonfiction: {
    domain: 'general',
    audience: 'general',
    firstOccurrenceWithOriginal: true,
  },
  llm: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    timeout: 600,
    maxRetries: 4,
    tiers: {
      strong: {
        model: 'deepseek-v4-pro',
        options: { thinking: true, reasoning_effort: 'high' },
      },
      cheap: {
        model: 'deepseek-v4-flash',
        options: { thinking: true, reasoning_effort: 'high' },
      },
      fast: {
        model: 'deepseek-v4-flash',
        options: { thinking: false },
      },
    },
  },
  segment: {
    maxCharsPerBatch: 1800,
    maxCharsPerSegment: 1200,
  },
  pipeline: {
    review: false,
    autofixSevere: false,
    alignRetryLimit: 2,
    polish: true,
    backtranslateSample: 0,
    consistencyQa: false,
    rollingContextSegments: 6,
    bookUnderstanding: true,
    prescanConcurrency: 4,
    reviewConcurrency: 4,
    glossaryScope: 'chapter',
  },
  output: {
    mono: true,
    bilingual: false,
    bilingualOrder: 'target_first',
    aboutPage: true,
  },
  honorificStrategy: 'keep_style',
  punctuationNormalize: true,
  stateDir: 'state',
};

export function defaultConfigYaml(): string {
  return `# Loop configuration
language:
  source: auto
  target: zh

# 翻译类型：fiction（小说） | nonfiction（非虚构/技术/社科/历史）
profile: fiction

# 当 profile 为 nonfiction 时生效
nonfiction:
  domain: general        # 领域，如：计算机科学 / 物理学 / 历史学 / 社会学
  audience: general      # 目标读者：技术从业者 / 本科生 / 科普读者
  firstOccurrenceWithOriginal: true  # 首次出现时是否保留原文括号

llm:
  provider: deepseek
  baseUrl: https://api.deepseek.com
  apiKeyEnv: DEEPSEEK_API_KEY
  timeout: 600
  maxRetries: 4
  tiers:
    strong:
      model: deepseek-v4-pro
      options:
        thinking: true
        reasoning_effort: high
    cheap:
      model: deepseek-v4-flash
      options:
        thinking: true
        reasoning_effort: high
    fast:
      model: deepseek-v4-flash
      options:
        thinking: false

segment:
  maxCharsPerBatch: 1800
  maxCharsPerSegment: 1200

pipeline:
  review: false
  autofixSevere: false
  alignRetryLimit: 2
  polish: true
  backtranslateSample: 0
  consistencyQa: false
  rollingContextSegments: 6
  bookUnderstanding: true
  prescanConcurrency: 4
  reviewConcurrency: 4
  glossaryScope: chapter

honorific:
  strategy: keep_style

punctuation:
  normalize: true

paths:
  stateDir: state

output:
  mono: true
  bilingual: false
  bilingualOrder: target_first
  aboutPage: true
`;
}
