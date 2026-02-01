import type React from 'react';

// 基于字符串生成稳定的哈希值
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// RGB 转 HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

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
  return [h * 360, s * 100, l * 100];
}

// HSL 转 RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  let r = 0;
  let g = 0;
  let b = 0;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// 色相偏移量（均匀分布在色轮上）
const HUE_OFFSETS = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];

// 根据标签名称和 accent 色生成内联样式
export function getTagColorStyle(tag: string, isDark: boolean): React.CSSProperties {
  // 从 CSS 变量获取 accent 色
  const accentRgb =
    getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() ||
    '99 102 241';

  const [r, g, b] = accentRgb.split(' ').map(Number);
  const [h, s] = rgbToHsl(r, g, b);

  // 基于标签哈希选择色相偏移
  const index = hashString(tag) % HUE_OFFSETS.length;
  const newHue = (h + HUE_OFFSETS[index]) % 360;

  // 生成适合浅色/深色主题的颜色
  const bgL = isDark ? 20 : 92;
  const textL = isDark ? 70 : 40;
  const borderL = isDark ? 30 : 80;
  const bgS = isDark ? 40 : 60;

  const [bgR, bgG, bgB] = hslToRgb(newHue, bgS, bgL);
  const [textR, textG, textB] = hslToRgb(newHue, s, textL);
  const [borderR, borderG, borderB] = hslToRgb(newHue, bgS, borderL);

  return {
    backgroundColor: `rgb(${bgR}, ${bgG}, ${bgB})`,
    color: `rgb(${textR}, ${textG}, ${textB})`,
    borderColor: `rgb(${borderR}, ${borderG}, ${borderB})`,
  };
}

// 保留旧函数以兼容，但标记为废弃
/** @deprecated 使用 getTagColorStyle 代替 */
export function getTagColorClasses(_tag: string): string {
  return '';
}
