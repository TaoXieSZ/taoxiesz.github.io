const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
const WORD_RANGE = /[a-zA-Z0-9]+/g;
const CJK_WPM = 300;
const EN_WPM = 200;

export function readingTime(text: string): string {
  const cjkChars = (text.match(CJK_RANGE) || []).length;
  const enWords = (text.replace(CJK_RANGE, '').match(WORD_RANGE) || []).length;
  const minutes = Math.ceil(cjkChars / CJK_WPM + enWords / EN_WPM);
  return `${Math.max(1, minutes)} 分钟`;
}
