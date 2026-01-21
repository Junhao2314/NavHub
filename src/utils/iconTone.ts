// 深色模式下的背景色调色板 - 柔和的浅色系，按色相排列
const DARK_BG_PALETTE = [
  { bg: '#ffe4e6', text: '#9f1239', hue: 0 },    // rose - 红色系
  { bg: '#ffedd5', text: '#9a3412', hue: 30 },   // orange - 橙色系
  { bg: '#fef3c7', text: '#92400e', hue: 45 },   // amber - 黄色系
  { bg: '#d1fae5', text: '#065f46', hue: 150 },  // emerald - 绿色系
  { bg: '#ccfbf1', text: '#115e59', hue: 170 },  // teal - 青绿色系
  { bg: '#cffafe', text: '#155e75', hue: 190 },  // cyan - 青色系
  { bg: '#dbeafe', text: '#1e40af', hue: 220 },  // blue - 蓝色系
  { bg: '#e0e7ff', text: '#3730a3', hue: 240 },  // indigo - 靛蓝色系
  { bg: '#ede9fe', text: '#5b21b6', hue: 270 },  // violet - 紫色系
  { bg: '#fae8ff', text: '#86198f', hue: 300 },  // fuchsia - 品红色系
];

// 中性背景（用于灰度图标）
const NEUTRAL_BG = { bg: '#f1f5f9', text: '#475569' };

const PALETTE = [
  'bg-blue-100/60 text-blue-600',
  'bg-emerald-100/60 text-emerald-600',
  'bg-amber-100/60 text-amber-600',
  'bg-rose-100/60 text-rose-600',
  'bg-indigo-100/60 text-indigo-600',
  'bg-cyan-100/60 text-cyan-600',
  'bg-violet-100/60 text-violet-600',
  'bg-orange-100/60 text-orange-600',
  'bg-teal-100/60 text-teal-600',
  'bg-fuchsia-100/60 text-fuchsia-600',
];

const DEFAULT_TONE = 'bg-slate-100/60 text-slate-600';

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
    const expanded = hex.split('').map(ch => `${ch}${ch}`).join('');
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
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, l };
};

// 根据图标主色调选择对比背景色
const getContrastingBg = (dominantHue: number, saturation: number) => {
  // 如果饱和度很低（灰度图标），使用中性背景
  if (saturation < 0.15) {
    return NEUTRAL_BG;
  }
  
  // 找到色相差距最大的背景色（对比色）
  let bestMatch = DARK_BG_PALETTE[0];
  let maxDistance = 0;
  
  for (const palette of DARK_BG_PALETTE) {
    // 计算色相距离（考虑色环循环）
    let distance = Math.abs(palette.hue - dominantHue);
    if (distance > 180) distance = 360 - distance;
    
    if (distance > maxDistance) {
      maxDistance = distance;
      bestMatch = palette;
    }
  }
  
  return bestMatch;
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
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(NEUTRAL_BG);
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
          iconColorCache.set(iconUrl, NEUTRAL_BG);
          resolve(NEUTRAL_BG);
          return;
        }
        
        // 计算平均色相和饱和度
        let sumHue = 0, sumSat = 0;
        for (const c of colors) {
          sumHue += c.h;
          sumSat += c.s;
        }
        const avgHue = sumHue / colors.length;
        const avgSat = sumSat / colors.length;
        
        const result = getContrastingBg(avgHue, avgSat);
        iconColorCache.set(iconUrl, result);
        resolve(result);
      } catch {
        resolve(NEUTRAL_BG);
      }
    };
    
    img.onerror = () => {
      resolve(NEUTRAL_BG);
    };
    
    img.src = iconUrl;
  });
};

export const getIconToneStyle = (hexColor?: string, isDark?: boolean, icon?: string, url?: string, title?: string) => {
  // 如果有自定义颜色
  if (hexColor) {
    const rgb = hexToRgb(hexColor);
    if (rgb) {
      if (isDark) {
        // 深色模式：用浅色版本的自定义颜色
        return {
          backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
          color: `rgb(${Math.min(rgb.r + 60, 255)}, ${Math.min(rgb.g + 60, 255)}, ${Math.min(rgb.b + 60, 255)})`
        };
      }
      return {
        backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
        color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
      };
    }
  }
  
  // 深色模式下使用差异化背景
  if (isDark) {
    return getDarkBgStyle(icon, url, title);
  }
  
  return undefined;
};
