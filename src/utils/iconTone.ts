const PALETTE = [
  'bg-blue-100/60 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  'bg-emerald-100/60 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-100/60 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100/60 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-indigo-100/60 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  'bg-cyan-100/60 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300',
  'bg-violet-100/60 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-orange-100/60 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
  'bg-teal-100/60 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300',
  'bg-fuchsia-100/60 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
];

const DEFAULT_TONE = 'bg-slate-100/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

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

export const getIconToneStyle = (hexColor?: string) => {
  const rgb = hexToRgb(hexColor || '');
  if (!rgb) return undefined;
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
    color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  };
};
