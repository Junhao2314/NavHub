import { isLucideIconName } from '../components/ui/lucideIconMap';
import i18n, { APP_LANGUAGE } from '../config/i18n';
import { buildSeedLinks } from '../config/seedData';
import type { Category, LinkItem } from '../types';
import { isRecord } from './typeGuards';
import { normalizeHttpUrl } from './url';

const CATEGORY_ICON_FALLBACK = 'Folder';
const CATEGORY_ICON_ALIASES: Record<string, string> = {};

export const isTextIconName = (rawName: string): boolean => {
  const trimmed = rawName.trim();
  if (!trimmed) return false;
  return !/^[a-z0-9-]+$/i.test(trimmed);
};

const hasLucideIcon = (name: string): boolean => isLucideIconName(name);

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
    .join(i18n.t('common.listSeparator'));

  const suffix = invalidIcons.length > 3 ? i18n.t('common.etcSuffix') : '';

  return i18n.t('errors.invalidCategoryIconNotice', {
    count: invalidIcons.length,
    fallback: CATEGORY_ICON_FALLBACK,
    preview,
    suffix,
  });
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

    const aliasTarget = CATEGORY_ICON_ALIASES[normalizedIcon];
    if (aliasTarget) {
      nextIcon = aliasTarget;
    }

    if (!aliasTarget && !isTextIconName(normalizedIcon) && !hasLucideIcon(normalizedIcon)) {
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
    const locale = APP_LANGUAGE;
    return { links: buildSeedLinks(locale), didChange: true, dropped: 0, normalized: 0 };
  }

  let didChange = false;
  let dropped = 0;
  let normalized = 0;
  const sanitized: LinkItem[] = [];

  for (const raw of input) {
    if (!isRecord(raw)) {
      didChange = true;
      dropped += 1;
      continue;
    }

    const candidate = raw as unknown as LinkItem;
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
    : { links: sanitized, didChange, dropped, normalized };
};
