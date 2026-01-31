import { isLucideIconName, LEGACY_ICON_ALIASES } from '../components/ui/lucideIconMap';
import { detectUserLanguage } from '../config/i18n';
import { buildSeedLinks } from '../config/seedData';
import type { Category, LinkItem } from '../types';
import { normalizeHttpUrl } from './url';

const CATEGORY_ICON_FALLBACK = 'Folder';

export const isTextIconName = (rawName: string): boolean => {
  const trimmed = rawName.trim();
  if (!trimmed) return false;
  return !/^[a-z0-9-]+$/i.test(trimmed);
};

const hasLucideIcon = (name: string): boolean => isLucideIconName(name);

const normalizeLegacyAliasKey = (value: string): string => value.trim().toLowerCase();

export const resolveLegacyIconAlias = (value: string): string | null => {
  const alias = LEGACY_ICON_ALIASES[normalizeLegacyAliasKey(value)];
  return alias ?? null;
};

export const kebabToPascal = (kebabName: string): string =>
  kebabName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

export const normalizeCategoryIcon = (rawIcon: unknown): string => {
  if (typeof rawIcon !== 'string') return CATEGORY_ICON_FALLBACK;

  const trimmed = rawIcon.trim();
  if (!trimmed) return CATEGORY_ICON_FALLBACK;

  if (isTextIconName(trimmed)) return trimmed;

  const legacyAlias = resolveLegacyIconAlias(trimmed);
  if (legacyAlias) return legacyAlias;

  if (trimmed.includes('-')) {
    return kebabToPascal(trimmed);
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export type InvalidCategoryIcon = { name: string; icon: string };

export const formatInvalidIconNotice = (invalidIcons: InvalidCategoryIcon[]): string => {
  const preview = invalidIcons
    .slice(0, 3)
    .map(({ name, icon }) => `${name}(${icon})`)
    .join('、');
  const suffix = invalidIcons.length > 3 ? ' 等' : '';
  return `检测到 ${invalidIcons.length} 个分类图标不在 Lucide 子集内，已自动替换为 ${CATEGORY_ICON_FALLBACK}：${preview}${suffix}`;
};

export interface SanitizeCategoriesResult {
  categories: Category[];
  didChange: boolean;
  invalidIcons: InvalidCategoryIcon[];
}

export const sanitizeCategories = (input: Category[]): SanitizeCategoriesResult => {
  let didChange = false;
  const invalidIcons: InvalidCategoryIcon[] = [];

  const sanitized = input.map((category) => {
    const normalizedIcon = normalizeCategoryIcon(category.icon);
    let nextIcon = normalizedIcon;

    if (!isTextIconName(normalizedIcon) && !hasLucideIcon(normalizedIcon)) {
      invalidIcons.push({ name: category.name, icon: normalizedIcon });
      nextIcon = CATEGORY_ICON_FALLBACK;
    }

    if (nextIcon === category.icon) return category;
    didChange = true;
    return { ...category, icon: nextIcon };
  });

  return didChange
    ? { categories: sanitized, didChange, invalidIcons }
    : { categories: input, didChange, invalidIcons };
};

export interface SanitizeLinksResult {
  links: LinkItem[];
  didChange: boolean;
  dropped: number;
  normalized: number;
}

export const sanitizeLinks = (input: unknown): SanitizeLinksResult => {
  if (!Array.isArray(input)) {
    const locale = detectUserLanguage();
    return { links: buildSeedLinks(locale), didChange: true, dropped: 0, normalized: 0 };
  }

  let didChange = false;
  let dropped = 0;
  let normalized = 0;
  const sanitized: LinkItem[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      didChange = true;
      dropped += 1;
      continue;
    }

    const candidate = raw as LinkItem;
    const safeUrl = normalizeHttpUrl(candidate.url);
    if (!safeUrl) {
      didChange = true;
      dropped += 1;
      continue;
    }

    if (safeUrl !== candidate.url) {
      didChange = true;
      normalized += 1;
      sanitized.push({ ...candidate, url: safeUrl });
      continue;
    }

    sanitized.push(candidate);
  }

  return didChange
    ? { links: sanitized, didChange, dropped, normalized }
    : { links: input as LinkItem[], didChange, dropped, normalized };
};
