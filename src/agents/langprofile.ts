export function label(lang: string): string {
  const map: Record<string, string> = {
    ja: '日语',
    en: '英语',
    ko: '韩语',
    ru: '俄语',
    fr: '法语',
    de: '德语',
    es: '西班牙语',
    it: '意大利语',
    pt: '葡萄牙语',
    zh: '中文',
  };
  return map[lang] || lang;
}

export function translateGuidance(lang: string, honorificStrategy = 'keep_style'): string {
  if (lang === 'ja') {
    const honorific =
      honorificStrategy === 'keep_style'
        ? '保留敬称所体现的语气与人物关系（前辈/小X/X君等），不要生硬省略。'
        : honorificStrategy === 'drop'
          ? '可省略不影响语义的敬称，但保留人物关系信息。'
          : '按统一规则处理敬称，保持全书一致。';
    return `日语源文注意：\n- ${honorific}\n- 第一人称（僕/俺/私/あたし等）按角色性格译出辨识度。\n- 语气词、句尾助词在不改变原意前提下自然化，不要过度翻译腔。`;
  }
  if (lang === 'en') {
    return '英语源文注意：注意时态、虚拟语气、宗教/历史用典的准确传达；人名地名按通行译法。';
  }
  if (lang === 'ko') {
    return '韩语源文注意：注意敬语体系所体现的人物关系，称谓统一。';
  }
  return '忠实源语言习惯，自然转化为中文表达。';
}

export function termGuidance(lang: string): string {
  if (lang === 'ja') {
    return 'reading 用于标注日文读音（平假名/片假名/罗马音均可），可空。';
  }
  if (lang === 'en') {
    return 'reading 可空，或用于标注发音/词源。';
  }
  return 'reading 可空。';
}
