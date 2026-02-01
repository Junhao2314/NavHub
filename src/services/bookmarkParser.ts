/**
 * Bookmark Parser Service
 * 书签解析服务
 *
 * Parses browser bookmark HTML files (Netscape Bookmark format) exported from
 * Chrome, Edge, Firefox, etc.
 * 解析从 Chrome、Edge、Firefox 等浏览器导出的书签 HTML 文件（Netscape 书签格式）。
 *
 * Features / 功能:
 * - Extracts links with title, URL, and icon / 提取链接的标题、URL 和图标
 * - Preserves folder structure as categories / 保留文件夹结构作为分类
 * - Handles nested folder hierarchies / 处理嵌套的文件夹层级
 */

import { Category, LinkItem } from '../types';
import { generateId } from '../utils/id';
import { normalizeHttpUrl } from '../utils/url';

/**
 * Parsed bookmark link with folder path information
 * 带有文件夹路径信息的解析后书签链接
 */
export interface ParsedBookmarkLink extends LinkItem {
  /** Folder hierarchy path / 文件夹层级路径 */
  folderPath: string[];
}

/**
 * Import result containing links and categories
 * 包含链接和分类的导入结果
 */
export interface ImportResult {
  links: ParsedBookmarkLink[];
  categories: Category[];
}

/**
 * Parse a browser bookmark HTML file
 * 解析浏览器书签 HTML 文件
 *
 * @param file - The bookmark HTML file to parse / 要解析的书签 HTML 文件
 * @returns Parsed links and categories / 解析后的链接和分类
 *
 * @example
 * const file = event.target.files[0];
 * const { links, categories } = await parseBookmarks(file);
 */
export const parseBookmarks = async (file: File): Promise<ImportResult> => {
  // Read file content / 读取文件内容
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  const links: ParsedBookmarkLink[] = [];
  const categories: Category[] = [];
  const categoryMap = new Map<string, string>(); // Name -> ID / 名称 -> ID 映射

  // Generic root folder names to skip (map to 'common' category)
  // 通用根文件夹名称，跳过这些（映射到 'common' 分类）
  const genericRootFolders = new Set(['Bookmarks Bar', '书签栏', 'Other Bookmarks', '其他书签']);

  /**
   * Normalize folder path to category name
   * 将文件夹路径标准化为分类名称
   */
  const normalizeCategoryName = (path: string[]) => {
    if (path.length === 0) return 'common';
    const last = path[path.length - 1].trim();
    if (!last) return 'common';
    // Skip generic root folders / 跳过通用根文件夹
    if (path.length === 1 && genericRootFolders.has(last)) {
      return 'common';
    }
    return last;
  };

  /**
   * Get or create category ID for a name
   * 获取或创建分类名称对应的 ID
   */
  const getCategoryId = (name: string): string => {
    if (!name || name === 'common') return 'common';

    if (categoryMap.has(name)) {
      return categoryMap.get(name)!;
    }

    // Create new category / 创建新分类
    const newId = generateId();
    categories.push({
      id: newId,
      name: name,
      icon: 'Folder', // Default icon for imported folders / 导入文件夹的默认图标
    });
    categoryMap.set(name, newId);
    return newId;
  };

  /**
   * Recursively traverse the DL/DT structure
   * 递归遍历 DL/DT 结构
   *
   * Chrome bookmark structure:
   * Chrome 书签结构：
   * <DT><H3>Folder Name</H3><DL> ...items... </DL>
   */
  const traverse = (element: Element, currentPath: string[]) => {
    const children = Array.from(element.children);

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      const tagName = node.tagName.toUpperCase();

      if (tagName === 'DT') {
        // DT can contain an H3 (Folder) or A (Link)
        // DT 可以包含 H3（文件夹）或 A（链接）
        const h3 = node.querySelector('h3');
        const a = node.querySelector('a');
        const dl = node.querySelector('dl');

        if (h3 && dl) {
          // It's a folder - recurse into it / 这是一个文件夹 - 递归进入
          const folderName = (h3.textContent || 'Unknown').trim();
          traverse(dl, [...currentPath, folderName]);
        } else if (a) {
          // It's a link - extract data / 这是一个链接 - 提取数据
          const title = a.textContent || a.getAttribute('href') || 'No Title';
          const url = a.getAttribute('href');

          // Validate and normalize URL / 验证并标准化 URL
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
              folderPath,
            });
          }
        }
      }
    }
  };

  // Start traversal from root DL element / 从根 DL 元素开始遍历
  const rootDl = doc.querySelector('dl');
  if (rootDl) {
    traverse(rootDl, []);
  }

  return { links, categories };
};
