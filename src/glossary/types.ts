export const TYPE_PERSON = '人物';
export const TYPE_PLACE = '地名';
export const TYPE_ORG = '组织';
export const TYPE_TERM = '术语';
export const TYPE_SKILL = '招式';
export const TYPE_APPELLATION = '称谓';
export const TYPE_HONORIFIC = '敬称';
export const TYPE_SPEECH = '口癖';
export const TYPE_FIXED_EXPR = '固定表达';

// Non-fiction specific types
export const TYPE_CONCEPT = '概念';
export const TYPE_WORK = '著作';
export const TYPE_EVENT = '事件';
export const TYPE_LAW = '法案';
export const TYPE_SCHOOL = '学派';

export const ALL_TYPES = [
  TYPE_PERSON,
  TYPE_PLACE,
  TYPE_ORG,
  TYPE_TERM,
  TYPE_SKILL,
  TYPE_APPELLATION,
  TYPE_HONORIFIC,
  TYPE_SPEECH,
  TYPE_FIXED_EXPR,
  TYPE_CONCEPT,
  TYPE_WORK,
  TYPE_EVENT,
  TYPE_LAW,
  TYPE_SCHOOL,
];

export interface GlossaryTerm {
  source: string;
  target: string;
  reading?: string;
  type: string;
  gender?: string;
  aliases?: string[];
  firstChapter?: number;
  note?: string;
  status?: 'ok' | 'conflict';
  /** For nonfiction: whether to keep original in parentheses on first occurrence */
  keepOriginal?: boolean;
}
