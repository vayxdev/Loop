import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/types.js';
import type { Chapter, Document, Segment } from '../ingest/models.js';
import { loadDocument, chapterBatches } from '../ingest/segmenter.js';
import type { LLMClient } from '../llm/types.js';
import { buildClient } from '../llm/factory.js';
import { mergeUsage, usageDelta, emptyUsage } from '../llm/usage.js';
import { GlossaryStore } from '../glossary/store.js';
import type { GlossaryTerm } from '../glossary/types.js';
import { Analyzer, type AnalysisResult } from '../agents/analyzer.js';
import { Synopsizer } from '../agents/synopsis.js';
import { Translator } from '../agents/translator.js';
import { Polisher } from '../agents/polisher.js';
import { Reviewer, BackTranslator, type ReviewIssue } from '../agents/reviewer.js';
import { GlossaryExtractor } from '../agents/glossaryExtractor.js';
import { TitleTranslator } from '../agents/titleTranslator.js';
import { TerminologyValidator } from '../agents/terminologyValidator.js';
import { configurePrompts } from '../agents/prompts.js';
import { RollingContext, type RollingContextData } from './context.js';
import { assemble } from '../output/writer.js';
import {
  RunStore,
  STATUS_DONE,
  STATUS_PENDING,
  STATUS_TRANSLATING,
  REVIEW_DONE,
  REVIEW_PENDING,
  REVIEW_RUNNING,
  slugify,
  type Manifest,
  type ManifestChapter,
} from './runstore.js';

export type ProgressFn = (done: number, total: number, label: string) => void;

const LANG_ALIASES: Record<string, string> = {
  japanese: 'ja',
  日语: 'ja',
  日文: 'ja',
  jp: 'ja',
  jpn: 'ja',
  english: 'en',
  英语: 'en',
  英文: 'en',
  eng: 'en',
  russian: 'ru',
  俄语: 'ru',
  俄文: 'ru',
  rus: 'ru',
  chinese: 'zh',
  中文: 'zh',
  汉语: 'zh',
  'zh-cn': 'zh',
  zho: 'zh',
  korean: 'ko',
  韩语: 'ko',
  韩文: 'ko',
  kor: 'ko',
  french: 'fr',
  法语: 'fr',
  法文: 'fr',
  german: 'de',
  德语: 'de',
  德文: 'de',
  spanish: 'es',
  西班牙语: 'es',
  西班牙文: 'es',
  italian: 'it',
  意大利语: 'it',
  意大利文: 'it',
  portuguese: 'pt',
  葡萄牙语: 'pt',
  葡萄牙文: 'pt',
};

function normalizeLang(code: string): string {
  const c = (code || '').trim().toLowerCase();
  if (!c || ['auto', 'unknown', 'und', 'mixed', '多语言', '未知'].includes(c)) return '';
  if (LANG_ALIASES[c]) return LANG_ALIASES[c];
  const two = c.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : '';
}

function sampleText(doc: Document, maxChars = 6000): string {
  const parts: string[] = [];
  let len = 0;
  for (const ch of doc.chapters) {
    for (const s of ch.segments) {
      if (s.kind !== 'text') continue;
      parts.push(s.source);
      len += s.source.length;
      if (len >= maxChars) break;
    }
    if (len >= maxChars) break;
  }
  return parts.join('\n\n').slice(0, maxChars);
}

export class Orchestrator {
  private config: Config;
  private client: LLMClient;
  private analyzer: Analyzer;
  private synopsizer: Synopsizer;
  private translator: Translator;
  private polisher: Polisher;
  private reviewer: Reviewer;
  private backtrans: BackTranslator;
  private extractor: GlossaryExtractor;
  private titleTranslator: TitleTranslator;
  private terminologyValidator: TerminologyValidator;
  private usageCheckpoint = emptyUsage();

  constructor(config: Config, client?: LLMClient) {
    this.config = config;
    configurePrompts(config.profile, config.nonfiction);
    this.client = client || buildClient(config);
    this.usageCheckpoint = this.client.usageSummary();
    this.analyzer = new Analyzer(this.client, config);
    this.synopsizer = new Synopsizer(this.client, config);
    this.translator = new Translator(this.client, config);
    this.polisher = new Polisher(this.client, config);
    this.reviewer = new Reviewer(this.client, config);
    this.backtrans = new BackTranslator(this.client, config);
    this.extractor = new GlossaryExtractor(this.client, config);
    this.titleTranslator = new TitleTranslator(this.client, config);
    this.terminologyValidator = new TerminologyValidator(this.client, config);
  }

  private applyLanguage(lang: string): void {
    this.config.sourceLang = lang;
    for (const ag of [this.analyzer, this.synopsizer, this.translator, this.polisher, this.reviewer, this.backtrans, this.extractor]) {
      ag.src = lang;
    }
  }

  private async detectLanguage(doc: Document): Promise<string> {
    const text = sampleText(doc, 3000);
    if (!text) return '';
    const system = '你是语言识别助手。请判断以下文本的主要语言，只输出 ISO 639-1 两字母代码（如 ja/en/ko/ru/de/fr/es/zh）。不要解释。';
    const user = text.slice(0, 1500);
    const code = await this.client.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { tier: 'fast', stage: 'LanguageDetection' },
    );
    return normalizeLang(code);
  }

  private storeFor(doc: Document): RunStore {
    const runDir = path.join(this.config.stateDir, slugify(doc.title));
    return new RunStore(runDir);
  }

  private flushUsage(store: RunStore, scope: string): void {
    const current = this.client.usageSummary();
    const delta = usageDelta(current, this.usageCheckpoint);
    this.usageCheckpoint = current;
    const accumulated = store.loadUsage() || { calls: 0, inputTokens: 0, outputTokens: 0 };
    const merged = mergeUsage(accumulated, delta);
    store.saveUsage(merged);
    store.logEvent('usage_summary', { scope, delta, cumulative: merged });
  }

  async prepare(inputPath: string, progress?: ProgressFn): Promise<RunStore> {
    progress?.(0, 0, '解析文档…');
    const doc = loadDocument(inputPath, this.config.sourceLang, this.config.targetLang, this.config.segment.maxCharsPerSegment);
    const store = this.storeFor(doc);
    return store.lock(async () => {
      if (store.exists()) {
        store.logEvent('run_resumed', { input_path: inputPath, run_dir: store.runDir });
        return store;
      }
      if (this.config.sourceLang === 'auto') {
        progress?.(0, 0, '识别语言…');
        const detected = await this.detectLanguage(doc);
        if (!detected) {
          throw new Error('自动识别源语言失败，请在 config.yaml 的 language.source 指定语言代码。');
        }
        doc.sourceLang = detected;
        store.logEvent('language_detected', { source_lang: detected });
      }
      this.applyLanguage(doc.sourceLang);
      const manifest = store.stageDocument(doc, inputPath);

      progress?.(0, 0, '分析全书风格…');
      const sample = sampleText(doc);
      const analysis = sample ? await this.analyzer.analyze(sample) : {};
      if (analysis) {
        const glossary = new GlossaryStore(store.glossaryPath);
        try {
          for (const term of this.analyzer.seedGlossary(analysis)) {
            glossary.upsertTerm(term, 0);
          }
        } finally {
          glossary.close();
        }
      }
      store.saveAnalysis(analysis as Record<string, unknown>);
      store.saveContext(new RollingContext(Math.max(40, this.config.pipeline.rollingContextSegments)).toDict() as unknown as Record<string, unknown>);

      manifest.initialized = true;
      store.saveManifest(manifest);
      store.logEvent('run_initialized', {
        input_path: inputPath,
        title: doc.title,
        fmt: doc.fmt,
        source_lang: doc.sourceLang,
        target_lang: doc.targetLang,
      });
      this.flushUsage(store, 'prepare');
      return store;
    });
  }

  private loadStore(inputPath: string): { store: RunStore; manifest: Manifest; doc: Document } {
    // For resuming, we need the title to locate the store; re-parse quickly
    const doc = loadDocument(inputPath, this.config.sourceLang, this.config.targetLang, 0);
    const store = this.storeFor(doc);
    if (!store.exists()) {
      throw new Error('尚无翻译进度。请先运行 prepare 或 translate。');
    }
    const manifest = store.loadManifest();
    this.applyLanguage(manifest.sourceLang);
    return { store, manifest, doc };
  }

  async translate(inputPath: string, progress?: ProgressFn): Promise<RunStore> {
    let store: RunStore;
    let manifest: Manifest;
    let doc: Document;
    try {
      ({ store, manifest, doc } = this.loadStore(inputPath));
    } catch {
      store = await this.prepare(inputPath, progress);
      manifest = store.loadManifest();
      doc = loadDocument(inputPath, this.config.sourceLang, this.config.targetLang, 0);
    }

    const analysis = (store.loadAnalysis() || {}) as Partial<AnalysisResult>;
    const style = this.analyzer.styleBrief(analysis);

    // Book understanding
    let bookSynopsis = '';
    let chapterDigests: string[] = [];
    if (this.config.pipeline.bookUnderstanding) {
      progress?.(0, 0, '预扫全书梗概…');
      const texts = doc.chapters.map((ch) => ch.segments.map((s) => s.source).join('\n'));
      const concurrency = this.config.pipeline.prescanConcurrency;
      chapterDigests = await mapConcurrent(texts, (t) => this.synopsizer.digestChapter(t), concurrency);
      bookSynopsis = await this.synopsizer.bookSynopsis(chapterDigests, style);
    }

    const glossary = new GlossaryStore(store.glossaryPath);
    let rolling = RollingContext.fromDict(((store.loadContext() || { recentTargets: [], maxRecentKeep: 40 }) as unknown) as RollingContextData);

    const textSegs = doc.chapters.map((ch) => ch.segments.filter((s) => s.kind === 'text'));
    const totalBatches = textSegs.reduce((sum, segs) => sum + chapterBatches({ index: 0, segments: segs } as Chapter, this.config.segment.maxCharsPerBatch).length, 0);
    let doneBatches = 0;

    try {
      for (let ci = 0; ci < doc.chapters.length; ci++) {
        const ch = doc.chapters[ci];
        const mch = manifest.chapters[ci];
        if (mch.status === STATUS_DONE) {
          // restore rolling context from already done chapter
          const stored = store.loadChapter(ci);
          const doneTargets = stored.segments.map((s) => s.target || s.source).filter(Boolean);
          rolling.addTargets(doneTargets);
          continue;
        }

        mch.status = STATUS_TRANSLATING;
        store.saveManifest(manifest);
        progress?.(doneBatches, totalBatches, `翻译第 ${ci + 1}/${doc.chapters.length} 章…`);

        const digest = chapterDigests[ci] || '';
        await this.translateChapter(ch, {
          store,
          glossary,
          style,
          bookSynopsis,
          chapterDigest: digest,
          rolling,
          chapterIndex: ci,
          onBatch: () => {
            doneBatches++;
            progress?.(doneBatches, totalBatches, `翻译第 ${ci + 1}/${doc.chapters.length} 章…`);
          },
        });

        mch.status = STATUS_DONE;
        store.saveManifest(manifest);
        store.saveChapter(ch);
        store.saveContext(rolling.toDict() as unknown as Record<string, unknown>);
        this.flushUsage(store, `chapter_${ci}`);
      }
    } finally {
      glossary.close();
    }

    if (this.config.pipeline.review) {
      await this.review(inputPath, { autofix: this.config.pipeline.autofixSevere, progress });
    }

    await this.translateTitles(inputPath, progress);
    return store;
  }

  private async translateChapter(
    ch: Chapter,
    opts: {
      store: RunStore;
      glossary: GlossaryStore;
      style: string;
      bookSynopsis: string;
      chapterDigest: string;
      rolling: RollingContext;
      chapterIndex: number;
      onBatch: () => void;
    },
  ): Promise<void> {
    const allTerms = opts.glossary.allTerms();

    // Translate headings first
    const headings = ch.segments.filter((s) => s.kind === 'heading');
    if (headings.length) {
      const headingSources = headings.map((s) => s.source);
      const headingTerms =
        this.config.pipeline.glossaryScope === 'chapter'
          ? GlossaryStore.termsIn(allTerms, headingSources.join('\n'))
          : allTerms;
      const headingTargets = await this.translator.translateBatch(headingSources, {
        glossaryTerms: headingTerms,
        style: opts.style,
        context: '',
        bookSynopsis: opts.bookSynopsis,
        chapterDigest: opts.chapterDigest,
      });
      for (let i = 0; i < headings.length; i++) {
        headings[i].target = headingTargets[i];
      }
      opts.rolling.addTargets(headingTargets);
    }

    const batches = chapterBatches(ch, this.config.segment.maxCharsPerBatch);

    for (const batch of batches) {
      const sources = batch.map((s) => s.source);
      const relevantTerms =
        this.config.pipeline.glossaryScope === 'chapter'
          ? GlossaryStore.termsIn(allTerms, sources.join('\n'))
          : allTerms;
      const context = opts.rolling.render(this.config.pipeline.rollingContextSegments);

      let targets = await this.translator.translateBatch(sources, {
        glossaryTerms: relevantTerms,
        style: opts.style,
        context,
        bookSynopsis: opts.bookSynopsis,
        chapterDigest: opts.chapterDigest,
      });

      if (this.config.pipeline.polish) {
        const polished = await this.polisher.polish(targets, {
          glossaryTerms: relevantTerms,
          style: opts.style,
        });
        if (polished.length === targets.length) {
          targets = polished;
        }
      }

      for (let i = 0; i < batch.length; i++) {
        batch[i].target = targets[i];
      }
      opts.rolling.addTargets(targets);
      opts.onBatch();
    }

    // Extract glossary from whole chapter
    const chSource = ch.segments.map((s) => s.source).join('\n');
    const chTarget = ch.segments.map((s) => s.target || s.source).join('\n');
    const newTerms = await this.extractor.extract(chSource, chTarget, allTerms);
    for (const term of newTerms) {
      opts.glossary.upsertTerm({ ...term, firstChapter: term.firstChapter ?? opts.chapterIndex }, opts.chapterIndex);
    }

    // Non-fiction terminology validation
    if (this.config.profile === 'nonfiction') {
      const updatedTerms = opts.glossary.allTerms();
      const termIssues = await this.terminologyValidator.validate(chTarget, updatedTerms);
      ch.meta = { ...ch.meta, terminology_issues: termIssues };
    }

    // Backtranslate sample
    if (this.config.pipeline.backtranslateSample > 0) {
      const textSegs = ch.segments.filter((s) => s.kind === 'text');
      const sampleSize = Math.max(1, Math.floor(textSegs.length * this.config.pipeline.backtranslateSample));
      const sample = textSegs.slice(0, sampleSize);
      const bt = await this.backtrans.backtranslate(sample.map((s) => s.target || s.source));
      ch.meta = {
        ...ch.meta,
        backtranslation: { sources: sample.map((s) => s.source), targets: sample.map((s) => s.target || s.source), back: bt },
      };
    }
  }

  async review(inputPath: string, options: { force?: boolean; autofix?: boolean; progress?: ProgressFn } = {}): Promise<RunStore> {
    const { store, manifest, doc } = this.loadStore(inputPath);
    const glossary = new GlossaryStore(store.glossaryPath);
    const analysis = (store.loadAnalysis() || {}) as Partial<AnalysisResult>;
    const style = this.analyzer.styleBrief(analysis);

    try {
      for (let ci = 0; ci < manifest.chapters.length; ci++) {
        const mch = manifest.chapters[ci];
        if (mch.status !== STATUS_DONE) continue;
        if (mch.reviewStatus === REVIEW_DONE && !options.force) continue;
        mch.reviewStatus = REVIEW_RUNNING;
        store.saveManifest(manifest);
        options.progress?.(ci, manifest.chapters.length, `审校第 ${ci + 1}/${manifest.chapters.length} 章…`);

        const ch = store.loadChapter(ci);
        const textSegs = ch.segments.filter((s) => s.kind === 'text');
        const sources = textSegs.map((s) => s.source);
        const targets = textSegs.map((s) => s.target || s.source);
        const allTerms = glossary.allTerms();
        const relevant = GlossaryStore.termsIn(allTerms, sources.join('\n'));

        const issues = await this.reviewer.review(sources, targets, relevant);
        ch.meta = { ...ch.meta, review_issues: issues };

        if (options.autofix && issues.length) {
          for (const issue of issues) {
            if (issue.index < 0 || issue.index >= textSegs.length) continue;
            const seg = textSegs[issue.index];
            const before = textSegs[issue.index - 1]?.target || '';
            const after = textSegs[issue.index + 1]?.target || '';
            const fixed = await this.translator.retranslateWithFeedback(seg.source, {
              feedback: `${issue.type}: ${issue.detail}. 建议：${issue.suggestion}`,
              glossaryTerms: relevant,
              style,
              contextBefore: before,
              contextAfter: after,
            });
            if (fixed) seg.target = fixed;
          }
        }

        mch.reviewStatus = REVIEW_DONE;
        store.saveChapter(ch);
        store.saveManifest(manifest);
      }
    } finally {
      glossary.close();
    }
    return store;
  }

  status(inputPath: string): void {
    const { store, manifest } = this.loadStore(inputPath);
    const done = manifest.chapters.filter((c) => c.status === STATUS_DONE).length;
    const total = manifest.chapters.length;
    const reviewed = manifest.chapters.filter((c) => c.reviewStatus === REVIEW_DONE).length;
    const usage = store.loadUsage();
    console.log(`书名：${manifest.title}`);
    console.log(`语言：${manifest.sourceLang} → ${manifest.targetLang}`);
    console.log(`章节：${done}/${total} 完成，${reviewed}/${total} 已审校`);
    console.log(`状态目录：${store.runDir}`);
    if (usage) {
      console.log(`调用：${usage.calls}，输入 token：${usage.inputTokens}，输出 token：${usage.outputTokens}`);
    }
  }

  async translateTitles(inputPath: string, progress?: ProgressFn): Promise<RunStore> {
    const { store, manifest } = this.loadStore(inputPath);
    const glossary = new GlossaryStore(store.glossaryPath);
    try {
      const titles = manifest.chapters.map((c) => c.title || '').filter(Boolean);
      if (!titles.length) return store;
      progress?.(0, 0, '翻译章节标题…');
      const translated = await this.titleTranslator.translate(titles, glossary.allTerms());
      for (let i = 0; i < manifest.chapters.length; i++) {
        if (manifest.chapters[i].title) {
          manifest.chapters[i].titleTranslated = translated.shift();
        }
      }
      store.saveManifest(manifest);
      // Also update chapter files
      for (const mch of manifest.chapters) {
        if (mch.titleTranslated === undefined) continue;
        const ch = store.loadChapter(mch.index);
        ch.titleTranslated = mch.titleTranslated;
        store.saveChapter(ch);
      }
    } finally {
      glossary.close();
    }
    return store;
  }

  assemble(inputPath: string, outDir?: string): string[] {
    const { store, manifest, doc } = this.loadStore(inputPath);
    const chapters: Chapter[] = [];
    for (const mch of manifest.chapters) {
      const ch = store.loadChapter(mch.index);
      ch.title = mch.title;
      ch.titleTranslated = mch.titleTranslated;
      chapters.push(ch);
    }
    const outputDir = outDir || path.join(path.dirname(path.resolve(inputPath)), 'output');
    const baseName = path.basename(inputPath, path.extname(inputPath));
    return assemble({
      manifest,
      chapters,
      outDir: outputDir,
      baseName,
      bilingual: this.config.output.bilingual,
      bilingualOrder: this.config.output.bilingualOrder,
      aboutPage: this.config.output.aboutPage,
    });
  }
}

async function mapConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
