// 深色模式下的背景色调色板 - 柔和的浅色系，按色相排列
const DARK_BG_PALETTE = [
  { bg: '#ffe4e6', text: '#9f1239', hue: 0 }, // rose - 红色系
  { bg: '#ffedd5', text: '#9a3412', hue: 30 }, // orange - 橙色系
  { bg: '#fef3c7', text: '#92400e', hue: 45 }, // amber - 黄色系
  { bg: '#d1fae5', text: '#065f46', hue: 150 }, // emerald - 绿色系
  { bg: '#ccfbf1', text: '#115e59', hue: 170 }, // teal - 青绿色系
  { bg: '#cffafe', text: '#155e75', hue: 190 }, // cyan - 青色系
  { bg: '#dbeafe', text: '#1e40af', hue: 220 }, // blue - 蓝色系
  { bg: '#e0e7ff', text: '#3730a3', hue: 240 }, // indigo - 靛蓝色系
  { bg: '#ede9fe', text: '#5b21b6', hue: 270 }, // violet - 紫色系
  { bg: '#fae8ff', text: '#86198f', hue: 300 }, // fuchsia - 品红色系
];

// 中性背景（用于灰度图标）
const NEUTRAL_BG = { bg: '#f1f5f9', text: '#475569' };

// 卡片背景调色板 - 浅色模式（非常淡的色调）
const LIGHT_CARD_BG_PALETTE = [
  'rgba(254, 226, 226, 0.35)', // rose-100
  'rgba(255, 237, 213, 0.35)', // orange-100
  'rgba(254, 243, 199, 0.35)', // amber-100
  'rgba(209, 250, 229, 0.35)', // emerald-100
  'rgba(204, 251, 241, 0.35)', // teal-100
  'rgba(207, 250, 254, 0.35)', // cyan-100
  'rgba(219, 234, 254, 0.35)', // blue-100
  'rgba(224, 231, 255, 0.35)', // indigo-100
  'rgba(237, 233, 254, 0.35)', // violet-100
  'rgba(250, 232, 255, 0.35)', // fuchsia-100
];

// 卡片背景调色板 - 深色模式（非常淡的色调，保持对比度）
const DARK_CARD_BG_PALETTE = [
  'rgba(159, 18, 57, 0.12)', // rose
  'rgba(154, 52, 18, 0.12)', // orange
  'rgba(146, 64, 14, 0.12)', // amber
  'rgba(6, 95, 70, 0.12)', // emerald
  'rgba(17, 94, 89, 0.12)', // teal
  'rgba(21, 94, 117, 0.12)', // cyan
  'rgba(30, 64, 175, 0.12)', // blue
  'rgba(55, 48, 163, 0.12)', // indigo
  'rgba(91, 33, 182, 0.12)', // violet
  'rgba(134, 25, 143, 0.12)', // fuchsia
];

// 获取卡片背景色
export const getCardBgStyle = (icon?: string, url?: string, title?: string, isDark?: boolean) => {
  const seed = [icon, url, title].filter(Boolean).join('|');
  if (!seed) return undefined;
  const palette = isDark ? DARK_CARD_BG_PALETTE : LIGHT_CARD_BG_PALETTE;
  const index = hashString(seed) % palette.length;
  return { backgroundColor: palette[index] };
};

const PALETTE = [
  'bg-blue-100/80 text-blue-700',
  'bg-emerald-100/80 text-emerald-700',
  'bg-amber-100/80 text-amber-700',
  'bg-rose-100/80 text-rose-700',
  'bg-indigo-100/80 text-indigo-700',
  'bg-cyan-100/80 text-cyan-700',
  'bg-violet-100/80 text-violet-700',
  'bg-orange-100/80 text-orange-700',
  'bg-teal-100/80 text-teal-700',
  'bg-fuchsia-100/80 text-fuchsia-700',
];

const DEFAULT_TONE = 'bg-slate-100/80 text-slate-700';

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const toHex = (value: string) => value.trim().replace(/^#/, '');

export const normalizeHexColor = (value?: string) => {
  if (!value) return null;
  const hex = toHex(value);
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split('')
      .map((ch) => `${ch}${ch}`)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }
  return null;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const raw = normalized.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return { r, g, b };
};

export const getIconToneClass = (icon?: string, url?: string, title?: string) => {
  const seed = [icon, url, title].filter(Boolean).join('|');
  if (!seed) return DEFAULT_TONE;
  const index = hashString(seed) % PALETTE.length;
  return PALETTE[index] || DEFAULT_TONE;
};

// 根据种子获取深色模式下的背景色
export const getDarkBgStyle = (icon?: string, url?: string, title?: string) => {
  const seed = [icon, url, title].filter(Boolean).join('|');
  if (!seed) return { backgroundColor: NEUTRAL_BG.bg, color: NEUTRAL_BG.text };
  const index = hashString(seed) % DARK_BG_PALETTE.length;
  const colors = DARK_BG_PALETTE[index];
  return { backgroundColor: colors.bg, color: colors.text };
};

// RGB 转 HSL
const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, l };
};

// 根据图标主色调选择对比背景色（加入种子，避免大量同色图标映射到同一个背景）
const getContrastingBg = (dominantHue: number, seed: string): { bg: string; text: string } => {
  const ranked = DARK_BG_PALETTE.map((palette) => {
    let distance = Math.abs(palette.hue - dominantHue);
    if (distance > 180) distance = 360 - distance;
    return { palette, distance };
  }).sort((a, b) => b.distance - a.distance);

  const poolSize = Math.min(3, ranked.length);
  const index = hashString(seed || String(dominantHue)) % poolSize;
  const chosen = ranked[index]?.palette || DARK_BG_PALETTE[0];
  return { bg: chosen.bg, text: chosen.text };
};

const getSeededDarkBg = (seed: string): { bg: string; text: string } => {
  if (!seed) return NEUTRAL_BG;
  const index = hashString(seed) % DARK_BG_PALETTE.length;
  const colors = DARK_BG_PALETTE[index];
  return { bg: colors.bg, text: colors.text };
};

// 图标颜色缓存
const iconColorCache = new Map<string, { bg: string; text: string }>();

// 分析图标颜色并返回对比背景
export const analyzeIconColor = (iconUrl: string): Promise<{ bg: string; text: string }> => {
  // 检查缓存
  if (iconColorCache.has(iconUrl)) {
    return Promise.resolve(iconColorCache.get(iconUrl)!);
  }

  return new Promise((resolve) => {
    const fallback = () => {
      const seeded = getSeededDarkBg(iconUrl);
      iconColorCache.set(iconUrl, seeded);
      resolve(seeded);
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fallback();
          return;
        }

        // 缩小图片以加快分析
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        // 收集非透明、非白、非黑像素的颜色
        const colors: { h: number; s: number; l: number }[] = [];

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // 跳过透明像素
          if (a < 128) continue;

          // 跳过接近白色或黑色的像素
          const brightness = (r + g + b) / 3;
          if (brightness > 240 || brightness < 15) continue;

          const hsl = rgbToHsl(r, g, b);
          // 只收集有一定饱和度的颜色
          if (hsl.s > 0.1) {
            colors.push(hsl);
          }
        }

        if (colors.length === 0) {
          fallback();
          return;
        }

        // 计算平均色相和饱和度
        let sumHue = 0,
          sumSat = 0;
        for (const c of colors) {
          sumHue += c.h;
          sumSat += c.s;
        }
        const avgHue = sumHue / colors.length;
        const avgSat = sumSat / colors.length;

        const result = avgSat < 0.15 ? getSeededDarkBg(iconUrl) : getContrastingBg(avgHue, iconUrl);
        iconColorCache.set(iconUrl, result);
        resolve(result);
      } catch {
        fallback();
      }
    };

    img.onerror = () => {
      fallback();
    };

    img.src = iconUrl;
  });
};

export const getIconToneStyle = (
  hexColor?: string,
  isDark?: boolean,
  icon?: string,
  url?: string,
  title?: string,
) => {
  // 如果有自定义颜色
  if (hexColor) {
    const rgb = hexToRgb(hexColor);
    if (rgb) {
      if (isDark) {
        // 深色模式：用浅色版本的自定义颜色
        return {
          backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
          color: `rgb(${Math.min(rgb.r + 60, 255)}, ${Math.min(rgb.g + 60, 255)}, ${Math.min(rgb.b + 60, 255)})`,
        };
      }
      return {
        backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
        color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      };
    }
  }

  // 深色模式下使用差异化背景
  if (isDark) {
    return getDarkBgStyle(icon, url, title);
  }

  return undefined;
};
