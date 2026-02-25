export const SOLAR_TERM_KEY_BY_ZH_NAME: Record<string, string> = {
  立春: '立春',
  雨水: '雨水',
  惊蛰: '惊蛰',
  春分: '春分',
  清明: '清明',
  谷雨: '谷雨',
  立夏: '立夏',
  小满: '小满',
  芒种: '芒种',
  夏至: '夏至',
  小暑: '小暑',
  大暑: '大暑',
  立秋: '立秋',
  处暑: '处暑',
  白露: '白露',
  秋分: '秋分',
  寒露: '寒露',
  霜降: '霜降',
  立冬: '立冬',
  小雪: '小雪',
  大雪: '大雪',
  冬至: '冬至',
  小寒: '小寒',
  大寒: '大寒',
};

// Legacy mapping kept for backward compatibility with older stored data.
export const SOLAR_TERM_LEGACY_KEY_BY_ZH_NAME: Record<string, string> = {
  立春: '{jq.liChun}',
  雨水: '{jq.yuShui}',
  惊蛰: '{jq.jingZhe}',
  春分: '{jq.chunFen}',
  清明: '{jq.qingMing}',
  谷雨: '{jq.guYu}',
  立夏: '{jq.liXia}',
  小满: '{jq.xiaoMan}',
  芒种: '{jq.mangZhong}',
  夏至: '{jq.xiaZhi}',
  小暑: '{jq.xiaoShu}',
  大暑: '{jq.daShu}',
  立秋: '{jq.liQiu}',
  处暑: '{jq.chuShu}',
  白露: '{jq.baiLu}',
  秋分: '{jq.qiuFen}',
  寒露: '{jq.hanLu}',
  霜降: '{jq.shuangJiang}',
  立冬: '{jq.liDong}',
  小雪: '{jq.xiaoXue}',
  大雪: '{jq.daXue}',
  冬至: '{jq.dongZhi}',
  小寒: '{jq.xiaoHan}',
  大寒: '{jq.daHan}',
};

export const SOLAR_TERM_ZH_NAMES: string[] = [
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
  '小寒',
  '大寒',
];

const SOLAR_TERM_ZH_NAME_BY_KEY: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(SOLAR_TERM_KEY_BY_ZH_NAME).map(([name, key]) => [key, name]),
  ),
  ...Object.fromEntries(
    Object.entries(SOLAR_TERM_LEGACY_KEY_BY_ZH_NAME).map(([name, key]) => [key, name]),
  ),
};

export const getSolarTermKeyByZhName = (name: string): string | null => {
  const trimmed = name.trim();
  return SOLAR_TERM_KEY_BY_ZH_NAME[trimmed] ?? null;
};

export const getSolarTermZhNameByKey = (key: string): string | null => {
  const trimmed = key.trim();
  return SOLAR_TERM_ZH_NAME_BY_KEY[trimmed] ?? null;
};

export type ParsedLunarMonthDay = {
  month: number;
  day: number;
  isLeapMonth: boolean;
};

const LUNAR_MONTH_BY_ZH: Record<string, number> = {
  正: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  冬: 11,
  腊: 12,
};

const parseChineseNumber = (text: string): number | null => {
  const s = text.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);

  const map: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (s === '十') return 10;
  if (s.length === 2 && s[0] === '十' && map[s[1]] !== undefined) return 10 + map[s[1]];
  if (s.length === 2 && map[s[0]] !== undefined && s[1] === '十') return map[s[0]] * 10;
  if (s.length === 3 && map[s[0]] !== undefined && s[1] === '十' && map[s[2]] !== undefined) {
    return map[s[0]] * 10 + map[s[2]];
  }
  return null;
};

const parseLunarMonthZh = (text: string): { month: number; isLeapMonth: boolean } | null => {
  let s = text.trim();
  if (!s) return null;

  let isLeapMonth = false;
  if (s.startsWith('闰')) {
    isLeapMonth = true;
    s = s.slice(1);
  }

  // normalize suffix
  if (s.endsWith('月')) s = s.slice(0, -1);

  const month = LUNAR_MONTH_BY_ZH[s] ?? parseChineseNumber(s);
  if (!month || month < 1 || month > 12) return null;
  return { month, isLeapMonth };
};

const parseLunarDayZh = (text: string): number | null => {
  const s = text.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);

  if (s.startsWith('初')) {
    const n = parseChineseNumber(s.slice(1));
    return n && n >= 1 && n <= 10 ? n : null;
  }

  if (s.startsWith('廿')) {
    const rest = s.slice(1);
    if (!rest) return 20;
    const n = parseChineseNumber(rest);
    return n && n >= 1 && n <= 9 ? 20 + n : null;
  }

  if (s.startsWith('卅')) {
    const rest = s.slice(1);
    if (!rest) return 30;
    const n = parseChineseNumber(rest);
    return n && n >= 0 && n <= 0 ? 30 : null;
  }

  const n = parseChineseNumber(s);
  return n && n >= 1 && n <= 30 ? n : null;
};

/**
 * Parse lunar date in Chinese, e.g.
 * - "腊月二十三"
 * - "闰二月初一"
 */
export const parseLunarMonthDayZh = (text: string): ParsedLunarMonthDay | null => {
  const s = text.trim();
  if (!s) return null;

  const match = s.match(/^(闰)?(.+?)月(.+?)$/);
  if (!match) return null;

  const isLeapMonth = Boolean(match[1]);
  const monthPart = `${match[2]}月`;
  const dayPart = match[3];

  const monthParsed = parseLunarMonthZh((isLeapMonth ? '闰' : '') + monthPart);
  if (!monthParsed) return null;

  const day = parseLunarDayZh(dayPart);
  if (!day) return null;

  return { month: monthParsed.month, day, isLeapMonth: monthParsed.isLeapMonth };
};
