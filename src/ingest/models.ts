export interface Segment {
  index: number;
  source: string;
  target?: string;
  kind: 'text' | 'heading';
  anchor?: string;
  resourceHref?: string;
  cont: boolean;
  meta?: Record<string, unknown>;
}

export interface Chapter {
  index: number;
  title?: string;
  titleTranslated?: string;
  segments: Segment[];
  meta?: Record<string, unknown>;
}

export interface Document {
  title: string;
  sourceLang: string;
  targetLang: string;
  fmt: string;
  chapters: Chapter[];
}

export function textSegments(chapter: Chapter): Segment[] {
  return chapter.segments.filter((s) => s.kind === 'text');
}
