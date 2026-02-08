import type { LucideIcon } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports.mjs';
import React from 'react';

type LucideIconModule = { default: LucideIcon };
type LucideIconImporter = () => Promise<LucideIconModule>;

const IMPORTER_PATH_REGEX = /icons\/([a-z0-9-]+)\.js/;

const kebabToPascal = (kebabName: string): string =>
  kebabName
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const canonicalIconEntries = (() => {
  const seenModulePaths = new Set<string>();
  const entries: Array<[string, LucideIconImporter]> = [];

  for (const [kebabName, importer] of Object.entries(
    dynamicIconImports as Record<string, LucideIconImporter>,
  )) {
    const source = importer.toString();
    const modulePath = source.match(IMPORTER_PATH_REGEX)?.[1] ?? kebabName;
    if (seenModulePaths.has(modulePath)) continue;

    seenModulePaths.add(modulePath);
    entries.push([kebabToPascal(modulePath), importer]);
  }

  return entries;
})();

export const LUCIDE_ICON_IMPORTERS = Object.fromEntries(canonicalIconEntries) as Record<
  string,
  LucideIconImporter
>;

export type LucideIconName = string;

export const LUCIDE_ICON_NAMES = Object.keys(LUCIDE_ICON_IMPORTERS) as LucideIconName[];

const LUCIDE_ICON_NAME_SET = new Set(LUCIDE_ICON_NAMES);
const LOWERCASE_ICON_NAME_MAP = new Map(
  LUCIDE_ICON_NAMES.map((name) => [name.toLowerCase(), name] as const),
);

export function isLucideIconName(name: string): boolean {
  return LUCIDE_ICON_NAME_SET.has(name as LucideIconName);
}

export function resolveLucideIconName(rawName: string): LucideIconName | null {
  const trimmed = rawName.trim();
  if (!trimmed) return null;

  if (isLucideIconName(trimmed)) return trimmed;

  const lowerCaseMatch = LOWERCASE_ICON_NAME_MAP.get(trimmed.toLowerCase());
  if (lowerCaseMatch) return lowerCaseMatch;

  if (trimmed.includes('-')) {
    const normalized = kebabToPascal(trimmed.toLowerCase());
    if (isLucideIconName(normalized)) return normalized;
  }

  return null;
}

const lazyIconCache = new Map<LucideIconName, React.LazyExoticComponent<LucideIcon>>();

export function getLucideIconLazy(name: LucideIconName): React.LazyExoticComponent<LucideIcon> {
  const cached = lazyIconCache.get(name);
  if (cached) return cached;

  const LazyIcon = React.lazy(LUCIDE_ICON_IMPORTERS[name] as () => Promise<LucideIconModule>);
  lazyIconCache.set(name, LazyIcon);
  return LazyIcon;
}
