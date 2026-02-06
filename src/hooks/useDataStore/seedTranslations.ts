import type { SupportedLanguageCode } from '../../config/i18n';
import { buildSeedCategories, buildSeedLinks } from '../../config/seedData';
import type { Category, LinkItem } from '../../types';

export function applySeedTranslations(options: {
  categories: Category[];
  links: LinkItem[];
  previousLanguage: SupportedLanguageCode;
  nextLanguage: SupportedLanguageCode;
}): { categories: Category[]; links: LinkItem[]; didChange: boolean } {
  const { categories, links, previousLanguage, nextLanguage } = options;

  const previousSeedCategories = buildSeedCategories(previousLanguage);
  const nextSeedCategories = buildSeedCategories(nextLanguage);
  const previousSeedLinks = buildSeedLinks(previousLanguage);
  const nextSeedLinks = buildSeedLinks(nextLanguage);

  const previousCategoryById = new Map(previousSeedCategories.map((cat) => [cat.id, cat]));
  const nextCategoryById = new Map(nextSeedCategories.map((cat) => [cat.id, cat]));

  const previousLinkById = new Map(previousSeedLinks.map((link) => [link.id, link]));
  const nextLinkById = new Map(nextSeedLinks.map((link) => [link.id, link]));

  let didChange = false;

  const nextCategories = categories.map((category) => {
    const previousSeed = previousCategoryById.get(category.id);
    const nextSeed = nextCategoryById.get(category.id);
    if (!previousSeed || !nextSeed) return category;
    if (category.name !== previousSeed.name) return category;
    if (category.name === nextSeed.name) return category;
    didChange = true;
    return { ...category, name: nextSeed.name };
  });

  const nextLinks = links.map((link) => {
    const previousSeed = previousLinkById.get(link.id);
    const nextSeed = nextLinkById.get(link.id);
    if (!previousSeed || !nextSeed) return link;

    let updated = link;
    let updatedFlag = false;

    if (
      typeof link.description === 'string' &&
      link.description === previousSeed.description &&
      link.description !== nextSeed.description
    ) {
      updated = { ...updated, description: nextSeed.description };
      updatedFlag = true;
    }

    if (link.title === previousSeed.title && link.title !== nextSeed.title) {
      updated = { ...updated, title: nextSeed.title };
      updatedFlag = true;
    }

    if (updatedFlag) {
      didChange = true;
      return updated;
    }

    return link;
  });

  return { categories: nextCategories, links: nextLinks, didChange };
}
