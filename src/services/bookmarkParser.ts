import { LinkItem, Category } from '../types';
import { generateId } from '../utils/id';
import { normalizeHttpUrl } from '../utils/url';

export interface ParsedBookmarkLink extends LinkItem {
  folderPath: string[];
}

export interface ImportResult {
  links: ParsedBookmarkLink[];
  categories: Category[];
}

export const parseBookmarks = async (file: File): Promise<ImportResult> => {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  const links: ParsedBookmarkLink[] = [];
  const categories: Category[] = [];
  const categoryMap = new Map<string, string>(); // Name -> ID
  const genericRootFolders = new Set(['Bookmarks Bar', '书签栏', 'Other Bookmarks', '其他书签']);

  const normalizeCategoryName = (path: string[]) => {
    if (path.length === 0) return 'common';
    const last = path[path.length - 1].trim();
    if (!last) return 'common';
    if (path.length === 1 && genericRootFolders.has(last)) {
      return 'common';
    }
    return last;
  };

  // Helper to get or create category ID
  const getCategoryId = (name: string): string => {
    if (!name || name === 'common') return 'common';

    if (categoryMap.has(name)) {
      return categoryMap.get(name)!;
    }
    
    // Check existing default categories could be mapped here if we had access, 
    // but for now we create new ones.
    const newId = generateId();
    categories.push({
      id: newId,
      name: name,
      icon: 'Folder' // Default icon for imported folders
    });
    categoryMap.set(name, newId);
    return newId;
  };

  // Traverse the DL/DT structure
  // Chrome structure: <DT><H3>Folder Name</H3><DL> ...items... </DL>
  
  const traverse = (element: Element, currentPath: string[]) => {
    const children = Array.from(element.children);
    
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      const tagName = node.tagName.toUpperCase();

      if (tagName === 'DT') {
        // DT can contain an H3 (Folder) or A (Link)
        const h3 = node.querySelector('h3');
        const a = node.querySelector('a');
        const dl = node.querySelector('dl');

        if (h3 && dl) {
            // It's a folder
            const folderName = (h3.textContent || 'Unknown').trim();
            traverse(dl, [...currentPath, folderName]);
        } else if (a) {
            // It's a link
            const title = a.textContent || a.getAttribute('href') || 'No Title';
            const url = a.getAttribute('href');

            const safeUrl = url ? normalizeHttpUrl(url) : null;
            if (safeUrl) {
                const folderPath = currentPath.length ? [...currentPath] : [];
                links.push({
                    id: generateId(),
                    title: title,
                    url: safeUrl,
                    categoryId: getCategoryId(normalizeCategoryName(folderPath)),
                    createdAt: Date.now(),
                    icon: a.getAttribute('icon') || undefined,
                    folderPath
                });
            }
        }
      }
    }
  };

  const rootDl = doc.querySelector('dl');
  if (rootDl) {
    traverse(rootDl, []);
  }

  return { links, categories };
};
