import type { LLMClient, Message, UsageSummary } from '../types.js';

export class FakeClient implements LLMClient {
  private usage: UsageSummary = { calls: 0, inputTokens: 0, outputTokens: 0 };

  async complete(messages: Message[]): Promise<string> {
    this.usage.calls++;
    const last = messages[messages.length - 1]?.content || '';
    this.usage.inputTokens += Math.ceil(last.length / 4);
    const reply = `[Fake] ${last.slice(0, 60)}...`;
    this.usage.outputTokens += Math.ceil(reply.length / 4);
    return reply;
  }

  async completeJson<T>(messages: Message[]): Promise<T> {
    this.usage.calls++;
    const last = messages[messages.length - 1]?.content || '';
    this.usage.inputTokens += Math.ceil(last.length / 4);
    const full = messages.map((m) => m.content).join('\n');
    const nMatch = last.match(/(?:共 |length must be exactly |数组长度必须恰好为 )(\d+)/);
    const n = nMatch ? Number(nMatch[1]) : 2;

    let result: unknown;
    if (full.includes('标题翻译') || /待译.*标题/.test(full)) {
      result = { titles: Array.from({ length: n }, (_, i) => `[标题${i + 1}]`) };
    } else if (full.includes('非虚构类图书的章节摘要')) {
      result = '本章摘要：介绍了核心概念与论证。';
    } else if (full.includes('小说章节梗概')) {
      result = '本章讲述了重要的情节。';
    } else if (full.includes('非虚构类图书的全书概览')) {
      result = '本书系统论述了该领域的重要概念与发展脉络。';
    } else if (full.includes('小说全书概览')) {
      result = '这是一部关于成长与冒险的小说。';
    } else if (full.includes('非虚构类图书译者') || full.includes('译文数组') || full.includes('等长的中文译文')) {
      result = { translations: Array.from({ length: n }, (_, i) => `[译文${i + 1}]`) };
    } else if (full.includes('中文润色编辑') || full.includes('待润色中文译文') || full.includes('非虚构类图书的中文编辑')) {
      result = { polished: Array.from({ length: n }, (_, i) => `[润色${i + 1}]`) };
    } else if (full.includes('术语与称呼抽取器') || full.includes('术语与专有名词抽取器') || full.includes('对照表')) {
      result = { terms: [] };
    } else if (full.includes('译文审校') || full.includes('非虚构类译文审校')) {
      result = { issues: [] };
    } else if (full.includes('术语一致性审查员') || full.includes('术语与专有名词一致性')) {
      result = { issues: [] };
    } else if (full.includes('回译译者') || full.includes('回译')) {
      result = { backtranslations: Array.from({ length: n }, (_, i) => `[回译${i + 1}]`) };
    } else if (full.includes('非虚构类图书翻译项目的前期分析师') || full.includes('核心概念')) {
      result = {
        domain: 'general',
        audience: 'general',
        translation_conventions: ['术语首次出现保留原文'],
        style_guide: '准确、客观、清晰',
        key_concepts: [],
        key_entities: [],
      };
    } else if (full.includes('小说翻译项目的前期分析师') || full.includes('样章')) {
      result = {
        genre: '童话',
        tone: '温柔叙事',
        style_guide: '保持童话语气',
        narration: '第一人称',
        pacing: '舒缓',
        register: '书面语',
        dialogue_style: '简洁',
        rhetoric: '比喻',
        characters: [],
        terms: [],
      };
    } else {
      result = { result: '[fake]' };
    }

    const json = JSON.stringify(result);
    this.usage.outputTokens += Math.ceil(json.length / 4);
    return result as T;
  }

  usageSummary(): UsageSummary {
    return { ...this.usage };
  }
}
