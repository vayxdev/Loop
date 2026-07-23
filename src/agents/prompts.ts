import type { GlossaryTerm } from '../glossary/types.js';
import type { NonfictionConfig } from '../config/types.js';
import { label, termGuidance, translateGuidance } from './langprofile.js';

export type PromptName =
  | 'analyzer_system'
  | 'analyzer_user'
  | 'chapter_digest_system'
  | 'chapter_digest_user'
  | 'book_synopsis_system'
  | 'book_synopsis_user'
  | 'translator_system'
  | 'translator_user'
  | 'translator_fix_user'
  | 'reviewer_system'
  | 'reviewer_user'
  | 'polisher_system'
  | 'polisher_user'
  | 'glossary_extractor_system'
  | 'glossary_extractor_user'
  | 'backtranslate_system'
  | 'backtranslate_user'
  | 'title_translator_system'
  | 'title_translator_user'
  | 'terminology_validator_system'
  | 'terminology_validator_user';

export type Profile = 'fiction' | 'nonfiction';

interface PromptConfig {
  profile: Profile;
  nonfiction: NonfictionConfig;
}

let activeConfig: PromptConfig = {
  profile: 'fiction',
  nonfiction: { domain: 'general', audience: 'general', firstOccurrenceWithOriginal: true },
};

export function configurePrompts(profile: Profile, nonfiction: NonfictionConfig): void {
  activeConfig = { profile, nonfiction };
}

export function currentProfile(): Profile {
  return activeConfig.profile;
}

const PUNCT_RULE =
  '在不违反当前任务其它明确格式要求的前提下，保留输入文本中标点与符号的结构作用；' +
  '除句号、逗号等普通句读可按中文语序调整外，引号、括号、问号、叹号、冒号、分号、' +
  '破折号、省略号、间隔号、波浪号、斜杠、星号、音符及其他特殊符号均不得遗漏，' +
  '并保持其位置、层级、数量、重复形式和配对关系。' +
  '标点务必转换为简体中文大陆通用全角形式：句读用 ，。！？：；、，' +
  '引号用 “”‘’，省略号用 ……，破折号用 ——；' +
  '不得使用半角标点，也不要保留日式「」『』或英式直引号。';

function nfContext(): string {
  const { domain, audience } = activeConfig.nonfiction;
  return `领域：${domain}；目标读者：${audience}。`;
}

function nfTermRule(): string {
  const keep = activeConfig.nonfiction.firstOccurrenceWithOriginal;
  return keep
    ? '专业术语、人名、机构、著作等专有名词首次出现时采用“译名（Original Name）”格式，后续仅使用译名；已有通行中文译名的必须沿用。'
    : '专业术语、人名、机构、著作等专有名词全书统一译名；已有通行中文译名的必须沿用。';
}

function analyzerSystem(profile: Profile, src: string): string {
  if (profile === 'nonfiction') {
    return `你是一位非虚构类图书翻译项目的前期分析师。阅读以下${label(src)}样章，产出供后续翻译统一遵循的基准信息。\n${nfContext()}\n${nfTermRule()}\n仅输出 JSON：
{
  "domain": "领域细分（如：计算机科学 / 社会理论 / 欧洲史）",
  "audience": "目标读者层次",
  "translation_conventions": ["术语首次出现保留原文", "人名用通行译名", ...],
  "style_guide": "给译者的风格指南（中文，3-6 条要点）",
  "key_concepts": [{"source":"原文概念","reading":"读音(可空)","target":"建议中文译名","note":"定义或背景"}],
  "key_entities": [{"source":"原文专有名词","reading":"读音(可空)","target":"建议中文译名","type":"人名/机构/著作/事件/法案/地名/学派","note":"归属或背景"}]
}`;
  }
  return `你是一位小说翻译项目的前期分析师。阅读以下${label(src)}样章，产出供后续翻译统一遵循的基准信息。\n术语字段说明：${termGuidance(src)}\n仅输出 JSON：
{
  "genre": "体裁",
  "tone": "整体语气/文体",
  "style_guide": "给译者的风格指南（中文，3-6 条要点）",
  "narration": "叙事人称与时态",
  "pacing": "句式节奏",
  "register": "语域",
  "dialogue_style": "对话风格",
  "rhetoric": "修辞倾向",
  "characters": [{"source":"原文名","reading":"读音(可空)","target":"建议中文译名","gender":"男/女/未知","note":"性格/语气特征"}],
  "terms": [{"source":"原文词","reading":"读音(可空)","target":"建议中文译法","type":"地名/组织/术语","note":""}]
}`;
}

function analyzerUser(profile: Profile, src: string, sample: string): string {
  if (profile === 'nonfiction') {
    return `【样章原文】\n${sample}\n\n请分析并输出上述 JSON。重点识别核心概念、专有名词和翻译惯例；译名力求准确且符合中文非虚构写作习惯。`;
  }
  return `【样章原文（${label(src)}）】\n${sample}\n\n请分析并输出上述 JSON。人名、地名、专有名词尽量找全，译名力求自然且符合中文小说习惯。`;
}

function translatorSystem(profile: Profile, src: string, honorificStrategy: string): string {
  const punct = PUNCT_RULE;
  if (profile === 'nonfiction') {
    return `你是一位资深的非虚构类图书译者，专精将${label(src)}技术/学术/社科著作翻译为简体中文。${nfContext()}\n严格遵守：
1. 忠实原文，绝不漏译、增译，绝不合并或拆分段落；保留原文论证结构。
2. 输入是带编号的${label(src)}段落数组。必须输出等长的中文译文数组（数量与输入段落严格相等），顺序、数量与输入严格一一对应；第 i 个译文对应第 i 段原文。
3. 【专有名词对照表】是全书对照表的相关子集参考，可能含本批未出现的词条：只有当某词条原文确实出现在本批待译段落里，才套用其固定译法。${nfTermRule()}
4. 参考【全书概览】把握全书论点走向；参考【本章梗概】把握本章脉络；参考【前文译文】保持衔接。
5. 术语、人名、机构、著作名必须前后一致；已有通行中文译名的必须沿用。
6. 保留原文的逻辑结构：定义、因果、对比、列举、条件、限制词不得模糊或省略。
7. 保持客观、克制的学术/说明语气，不添加文学性修辞，不刻意口语化。
8. 数字、日期、单位、代码、公式、引用保留原格式或按中文规范转换。
9. ${punct}
10. 仅输出 JSON 对象：{"translations": ["第0段译文", "第1段译文", ...]}，不要任何解释或思考过程。`;
  }
  return `你是一位资深的文学翻译，精通将${label(src)}小说翻译为简体中文，专精长篇小说/轻小说。严格遵守：
1. 忠实原文，绝不漏译、增译，绝不合并或拆分段落；保留原文分段。
2. 输入是带编号的${label(src)}段落数组。必须输出等长的中文译文数组（数量与输入段落严格相等），顺序、数量与输入严格一一对应；第 i 个译文对应第 i 段原文。
3. 【专有名词对照表】是全书对照表的**相关子集参考**，可能含本批未出现的词条：**只有当某词条原文确实出现在本批待译段落里，才套用其固定译法**，切勿把与本批无关的词条硬塞进译文。已列词条全书统一用其译法；表中未列的专名，沿用【前文回顾】中已出现的译法，勿另起译名。
4. 参考【全书概览】把握整体走向（主线剧情、人物弧光、伏笔与谜底），使本段措辞与后文不冲突；参考【本章梗概】把握本章脉络；参考【前文译文】保持衔接：代词指代、人物称谓、语气与跨段句意须自然连贯。
5. 源语言相关要点：
${translateGuidance(src, honorificStrategy)}
6. 保留原文语气与文体；**严格执行【风格指南】给出的叙事人称、句式节奏与语域**；对话按角色的口癖/自称习惯译出辨识度；心理、修辞按中文小说习惯自然表达，不生硬直译、不堆砌翻译腔。
7. ${punct}
8. 仅输出 JSON 对象：{"translations": ["第0段译文", "第1段译文", ...]}，不要任何解释或思考过程。`;
}

function translatorUser(profile: Profile): string {
  if (profile === 'nonfiction') {
    return `【风格指南与翻译惯例】
{{style}}

【全书概览】
{{book_synopsis}}

【本章梗概】
{{chapter_digest}}

【专有名词对照表】（必须遵守）
{{glossary}}

【前文译文（最近）】
{{context}}

【待译${label('{{src}}')}段落】（共 {{n}} 段，编号 0 至 {{n_minus_1}}）
{{numbered_source}}

请翻译以上每一段，输出 JSON：{"translations":[...]}，数组长度必须恰好为 {{n}}。`;
  }
  return `【角色信息 / 风格指南】
{{style}}

【全书概览】
{{book_synopsis}}

【本章梗概】
{{chapter_digest}}

【专有名词对照表】（必须遵守）
{{glossary}}

【前文译文（最近）】
{{context}}

【待译${label('{{src}}')}段落】（共 {{n}} 段，编号 0 至 {{n_minus_1}}）
{{numbered_source}}

请翻译以上每一段，输出 JSON：{"translations":[...]}，数组长度必须恰好为 {{n}}。`;
}

function translatorFixUser(profile: Profile): string {
  const extra = profile === 'nonfiction'
    ? '重译必须保持原文逻辑与术语一致，不可为流畅而模糊限定条件。'
    : '重译必须修正审校意见并与前后文衔接。';
  return `【风格指南】
{{style}}

【全书概览】
{{book_synopsis}}

【本章梗概】
{{chapter_digest}}

【专有名词对照表】（必须遵守）
{{glossary}}

【前文译文】
{{context_before}}

【后文译文】
{{context_after}}

【审校意见】（首译存在的问题）
{{feedback}}

【待重译段落】（仅 1 段）
[0] {{source}}

请重译该段，完整传达原文全部信息。${extra}输出 JSON：{"translations":["译文"]}，数组长度恰为 1。`;
}

function polisherSystem(profile: Profile): string {
  if (profile === 'nonfiction') {
    return `你是一位非虚构类图书的中文编辑。在不改变原意、不增删信息、不添加文学修辞的前提下，提升译文清晰度：理顺长句、消除翻译腔、统一语域、确保术语一致。务必保持段数不变、与输入一一对应。严格沿用【专有名词对照表】的固定译法。${PUNCT_RULE}仅输出 JSON：{"polished":["第0段","第1段",...]}，长度与输入段数相等。`;
  }
  return `你是中文润色编辑。在不改变原意、不增删信息的前提下，提升译文的中文流畅度与文学性：理顺语序、修正翻译腔、统一文体语气。务必保持段数不变、与输入一一对应。严格沿用【专有名词对照表】的固定译法（表为全书参考，仅就译文实际涉及的词沿用，勿塞入无关词条）。${PUNCT_RULE}仅输出 JSON：{"polished":["第0段","第1段",...]}，长度与输入段数相等。`;
}

function reviewerSystem(profile: Profile, src: string, tgt: string): string {
  if (profile === 'nonfiction') {
    return `你是严格的非虚构类译文审校，比对${label(src)}原文与${label(tgt)}译文，逐段找出确凿的问题。问题类型：
- missing：漏译（原文有的信息译文缺失）
- added：增译（译文凭空增加原文没有的信息）
- mistranslation：误译/扭曲原意/限定词丢失
- terminology：原文出现、且对照表已给固定译法的词，译文未遵守
- pronoun：人称/性别代词错误
- logic：逻辑关系错误（因果、条件、对比、范围）
只报实质性错误：合理的语序调整、自然意译不算问题。拿不准是否为错就不报，宁缺毋滥。每条须给出可直接采纳的 suggestion。仅输出 JSON：
{"issues":[{"index":整数段号,"type":"...","detail":"简述","suggestion":"修改后的译文或具体改法"}]}
没有问题则输出 {"issues":[]}。`;
  }
  return `你是严格的译文审校，比对${label(src)}原文与${label(tgt)}译文，逐段找出**确凿**的问题。问题类型：
- missing：漏译（原文有的信息译文缺失）
- added：增译（译文凭空增加原文没有的信息）
- mistranslation：误译/误读原意
- terminology：原文确实出现、且对照表已给固定译法的词，译文未遵守
- pronoun：人称/性别代词错误
只报实质性错误：合理的语序调整、自然意译、风格润色**不算问题**，不要报。拿不准是否为错就不报，宁缺毋滥。每条须给出可直接采纳的 suggestion。仅输出 JSON：
{"issues":[{"index":整数段号,"type":"...","detail":"简述","suggestion":"修改后的译文或具体改法"}]}
没有问题则输出 {"issues":[]}。`;
}

function glossaryExtractorSystem(profile: Profile, src: string): string {
  const termField = termGuidance(src);
  if (profile === 'nonfiction') {
    return `你是非虚构类图书翻译项目的术语与专有名词抽取器。从给定的${label(src)}原文与其中文译文中，抽取应进入“专有名词对照表”的条目。
必须抽取：
1. 核心概念：理论、模型、方法、技术术语、学科专用概念。
2. 专有实体：重要人物、机构、学派、著作、法案、运动、历史事件、地名。
3. 同一实体的变体：缩写、全称、简称、不同拼写。
4. 需要全书统一的固定表达：特定定义句、标志性口号、反复出现的专有短语。
抽取原则：
- 依据本批译文中实际采用的中文写法填写 target，不要凭空创造译名。
- 若同一 source 在已有对照表中已有译法，尽量沿用；若本批译文出现明显不同译法，也照实输出，交由系统记录冲突。
- 对照表可能包含本批未出现条目，不要重复输出未在本批原文或译文中得到确认的项。
术语字段说明：${termField}
仅输出 JSON：
{"terms":[{"source":"原文词","reading":"读音(可空)","target":"本批译文中实际采用的中文译法","type":"概念/人名/机构/著作/事件/法案/地名/学派/术语","aliases":["同一 source 的其它原文写法/简称/拼写变体"],"note":"定义、归属或统一理由"}]}`;
  }
  return `你是小说翻译项目的术语与称呼抽取器。从给定的${label(src)}原文与其中文译文中，抽取应进入"专有名词对照表"的条目。
必须抽取：
1. 专有实体：人名、地名、组织名、作品内专有术语、招式名、物品名、设定名。
2. 同一实体的称呼变体：昵称、敬称、职称称呼、亲属称呼、外号、缩写、带前后缀的称呼、大小名/爱称/蔑称等。
   若原文称呼变体在译文中有独立译法，应作为单独条目输出，而不是只放进 aliases。
   aliases 用于记录同一 source 的其它原文写法/拼写/简称，不用于替代 source→target 的独立映射。
3. 需要全书统一的固定表达：人物口癖、反复出现且具有辨识度的称呼句、咒语/标语/固定台词、带设定含义的短语。
   只抽取会影响后续一致性的表达；不要抽普通寒暄、普通语气词、一次性修辞或常见词汇。
抽取原则：
- 依据本批译文中实际采用的中文写法填写 target，不要凭空创造译名。
- 若同一 source 在已有对照表中已有译法，尽量沿用；若本批译文出现明显不同译法，也照实输出，交由系统记录冲突。
- 对照表可能包含本批未出现条目，不要重复输出未在本批原文或译文中得到确认的项。
术语字段说明：${termField}
仅输出 JSON：
{"terms":[{"source":"原文词或原文称呼/固定表达","reading":"读音(可空)","target":"本批译文中实际采用的中文译法","type":"人物/地名/组织/术语/招式/称谓/口癖/固定表达","gender":"男/女/未知(仅人物)","aliases":["同一 source 的其它原文写法/简称/拼写变体"],"note":"归属、说话人、语气、使用场景或统一理由"}]}`;
}

function chapterDigestSystem(profile: Profile, src: string): string {
  if (profile === 'nonfiction') {
    return `你是非虚构类图书的章节摘要员。阅读给定的${label(src)}单章原文，用简体中文写出该章摘要（不超过 200 字）：概括核心论点、关键概念、重要事实、论证步骤，去除细枝末节。只输出摘要正文，不要解释。`;
  }
  return `你是小说章节梗概员。阅读给定的${label(src)}单章原文，用简体中文写出该章梗概（不超过 200 字）：交代本章关键情节推进、登场人物及其处境、重要信息或转折，去除细枝末节。只输出梗概正文，不要解释。`;
}

function bookSynopsisSystem(profile: Profile, src: string): string {
  if (profile === 'nonfiction') {
    return `你是非虚构类图书的全书概览员。依据【前期分析】与【各章摘要】，用简体中文写出一份“全书概览”（不超过 500 字），供译者在翻译任意章节前把握全局：核心论点、全书结构、重要概念脉络、整体立场/视角。只输出概览正文，不要解释或分点编号。`;
  }
  return `你是小说全书概览员。依据【前期分析】与【各章梗概】，用简体中文写出一份"全书概览"（不超过 500 字），供译者在翻译任意章节前把握全局，避免与后文冲突：主线剧情走向与结局、主要人物及其关系与弧光、核心设定/谜底/重要伏笔、整体基调。只输出概览正文，不要解释或分点编号。`;
}

function terminologyValidatorSystem(profile: Profile): string {
  if (profile !== 'nonfiction') {
    return `你是全书一致性审查员。给定专有名词对照表和若干章节译文摘要，检查：术语译法是否前后统一、同一人物代词性别是否一致、语气文体是否漂移、标点是否统一为简体中文规范。仅输出 JSON：{"issues":[{"type":"terminology/pronoun/tone/punctuation","detail":"...","where":"章节线索"}]}。`;
  }
  return `你是非虚构类图书的术语一致性审查员。给定【专有名词对照表】与【本章译文】，检查：
- 对照表内术语是否在本章译文中统一使用；
- 新出现的重要术语是否被遗漏；
- 人名、机构、著作、学派是否使用通行译名；
- 首次出现的术语是否按要求保留原文括号；
- 数字、年代、单位、引用是否存在明显错误。
仅输出 JSON：{"issues":[{"type":"terminology/entity/missing/format","detail":"...","where":"章节线索"}]}。`;
}

const BASE_TEMPLATES: Record<Exclude<PromptName, 'analyzer_system' | 'analyzer_user' | 'translator_system' | 'translator_user' | 'translator_fix_user' | 'reviewer_system' | 'polisher_system' | 'glossary_extractor_system' | 'chapter_digest_system' | 'book_synopsis_system' | 'terminology_validator_system'>, string> = {
  reviewer_user: `【专有名词对照表】
{{glossary}}

【逐段对照】（共 {{n}} 段）
{{pairs}}

请审校并输出 JSON：{"issues":[...]}。`,

  polisher_user: `【风格指南】
{{style}}

【专有名词对照表】
{{glossary}}

【待润色中文译文】（共 {{n}} 段）
{{numbered_target}}

输出 JSON：{"polished":[...]}，长度恰为 {{n}}。`,

  glossary_extractor_user: `【已有对照表（参考，尽量沿用其译法）】
{{glossary}}

【原文】
{{source}}

【译文】
{{target}}

请抽取新出现或被本批确认的术语与专有名词，输出 JSON：{"terms":[...]}。`,

  chapter_digest_user: `【章节原文】
{{source}}

请输出该章摘要（不超过 200 字）。`,

  book_synopsis_user: `【前期分析】
{{analysis}}

【各章摘要】
{{digests}}

请综合以上，输出全书概览（不超过 500 字）。`,

  backtranslate_system: `你是回译译者。把给定的中文译文回译成{{src_label}}，只看中文、忠实表达其含义，输出 JSON：{"backtranslations":["...",...]}，长度与输入一致。`,

  backtranslate_user: `【中文译文】（共 {{n}} 段）
{{numbered_target}}

输出 JSON：{"backtranslations":[...]}。`,

  title_translator_system: `你是{{src_label}}图书的标题翻译。把【章节标题与目录项】逐条翻译为简体中文：
1. 输入依次为各章标题或额外目录项标题（带编号），不包含书名。
2. 必须输出等长的中文数组（数量与输入条数严格相等），顺序一一对应。
3. 严格遵守【专有名词对照表】的固定译法（人名/地名/术语全书一致）。
4. 标题须简洁、合乎中文书名/章节命名习惯；不加引号、书名号或解释；
   形如「第3章」「序章」「エピローグ」之类的卷章序号/通用标记，按中文惯例翻译。
5. ${PUNCT_RULE}
仅输出 JSON：{"titles":["第0条标题译文","第1条标题译文",...]}，长度与输入条数相等。`,

  title_translator_user: `【专有名词对照表】
{{glossary}}

【待译标题】（共 {{n}} 条）
{{numbered_titles}}

输出 JSON：{"titles":[...]}，长度恰为 {{n}}。`,

  terminology_validator_user: `【专有名词对照表】
{{glossary}}

【本章译文】
{{target}}

请检查术语与专有名词一致性，输出 JSON：{"issues":[...]}。`,
};

function getTemplate(name: PromptName, vars: Record<string, string | number | undefined>): string {
  const { profile } = activeConfig;
  const src = String(vars.src || 'en');
  const tgt = String(vars.tgt || 'zh');
  const honorificStrategy = String(vars.honorific_strategy || 'keep_style');
  switch (name) {
    case 'analyzer_system':
      return analyzerSystem(profile, src);
    case 'analyzer_user':
      return analyzerUser(profile, src, '{{sample}}');
    case 'translator_system':
      return translatorSystem(profile, src, honorificStrategy);
    case 'translator_user':
      return translatorUser(profile);
    case 'translator_fix_user':
      return translatorFixUser(profile);
    case 'reviewer_system':
      return reviewerSystem(profile, src, tgt);
    case 'polisher_system':
      return polisherSystem(profile);
    case 'glossary_extractor_system':
      return glossaryExtractorSystem(profile, src);
    case 'chapter_digest_system':
      return chapterDigestSystem(profile, src);
    case 'book_synopsis_system':
      return bookSynopsisSystem(profile, src);
    case 'terminology_validator_system':
      return terminologyValidatorSystem(profile);
    default:
      return BASE_TEMPLATES[name];
  }
}

export function render(name: PromptName, vars: Record<string, string | number | undefined>): string {
  let tmpl = getTemplate(name, vars);
  for (const [key, val] of Object.entries(vars)) {
    const safe = val === undefined ? '' : String(val);
    tmpl = tmpl.split(`{{${key}}}`).join(safe);
  }
  return tmpl;
}

export function renderGlossary(terms: GlossaryTerm[]): string {
  if (!terms.length) return '（暂无）';
  return terms
    .map((t) => {
      const extras: string[] = [];
      if (t.gender) extras.push(t.gender);
      if (t.type) extras.push(t.type);
      if (t.reading) extras.push(`读音:${t.reading}`);
      const tag = extras.length ? `（${extras.join('，')}）` : '';
      const alias = t.aliases?.length ? ` [别名: ${t.aliases.join(', ')}]` : '';
      const note = t.note ? ` — ${t.note}` : '';
      return `- ${t.source} → ${t.target}${tag}${alias}${note}`;
    })
    .join('\n');
}

export function numbered(texts: string[]): string {
  return texts.map((t, i) => `[${i}] ${t}`).join('\n');
}

export function numberedPairs(sources: string[], targets: string[]): string {
  return sources
    .map((s, i) => `[${i}] 原文：${s}\n    译文：${targets[i] || ''}`)
    .join('\n');
}

export function punctRule(): string {
  return PUNCT_RULE;
}

export function translatorSystemVars(src: string, tgt: string, honorificStrategy: string): Record<string, string> {
  return {
    src_label: label(src),
    tgt_label: label(tgt),
    lang_guidance: translateGuidance(src, honorificStrategy),
    punct_rule: PUNCT_RULE,
    honorific_strategy: honorificStrategy,
  };
}

export function analyzerSystemVars(src: string, _tgt: string): Record<string, string> {
  return {
    src_label: label(src),
    term_guidance: termGuidance(src),
  };
}
