/**
 * useDataStore - 链接和分类数据管理
 *
 * 功能:
 *   - 管理链接（links）和分类（categories）的 CRUD 操作
 *   - 从 localStorage 加载/持久化数据
 *   - 支持链接置顶、排序、拖拽重排
 *   - 数据导入/导出
 *
 * 设计要点:
 *   - 数据校验：加载时对链接 URL 和分类图标进行校验，移除无效数据并提示用户。
 *   - 分类兜底：当链接所属分类被删除时，自动移动到"常用推荐"或第一个分类。
 *   - 排序逻辑：置顶链接优先显示，普通链接按 order 字段排序（支持拖拽调整）。
 *   - 图标缓存：从 localStorage 加载已缓存的 favicon，避免重复请求。
 */

import { arrayMove } from '@dnd-kit/sortable';
import type { TOptions } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../components/ui/DialogProvider';
import i18n, { APP_LANGUAGE, type SupportedLanguageCode } from '../config/i18n';
import { buildSeedCategories, buildSeedLinks } from '../config/seedData';
import { useAppStore } from '../stores/useAppStore';
import type { Category, LinkItem } from '../types';
import { COMMON_CATEGORY_ID, FAVICON_CACHE_KEY, LOCAL_STORAGE_KEY } from '../utils/constants';
import { generateId } from '../utils/id';
import { getCommonRecommendedLinks } from '../utils/recommendation';
import { formatInvalidIconNotice, sanitizeCategories, sanitizeLinks } from '../utils/sanitize';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/storage';
import { normalizeHttpUrl } from '../utils/url';

const t = (key: string, fallback: string, options?: TOptions): string => {
  try {
    const translated = i18n.t(key, options);
    if (typeof translated === 'string' && translated && translated !== key) {
      return translated;
    }
  } catch {
    // Ignore and fall back.
  }
  return fallback;
};

export const useDataStore = () => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { notify } = useDialog();
  const currentLanguage = useAppStore((state) => state.currentLanguage);
  const lastLanguageRef = useRef<SupportedLanguageCode | null>(null);

  /**
   * 更新数据并持久化
   *
   * 统一的数据更新入口，确保：
   * - 数据经过校验（sanitize）
   * - 同步写入 localStorage
   */
  const updateData = useCallback((newLinks: LinkItem[], newCategories: Category[]) => {
    const { categories: sanitizedCategories } = sanitizeCategories(newCategories);
    const { links: sanitizedLinks } = sanitizeLinks(newLinks);
    setLinks(sanitizedLinks);
    setCategories(sanitizedCategories);
    safeLocalStorageSetItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: sanitizedLinks, categories: sanitizedCategories }),
    );
  }, []);

  /**
   * 加载本地图标缓存
   *
   * 从 localStorage 读取已缓存的 favicon URL，并更新到对应链接。
   * 优先使用缓存的高质量图标，避免每次都请求 faviconextractor.com。
   */
  const loadLinkIcons = useCallback((linksToLoad: LinkItem[]) => {
    let cache: Record<string, string> = {};
    try {
      const stored = localStorage.getItem(FAVICON_CACHE_KEY);
      cache = stored ? JSON.parse(stored) : {};
    } catch {
      cache = {};
    }

    if (!cache || Object.keys(cache).length === 0) return;

    const updatedLinks = linksToLoad.map((link) => {
      if (!link.url) return link;
      try {
        const safeUrl = normalizeHttpUrl(link.url);
        if (!safeUrl) return link;
        const urlObj = new URL(safeUrl);
        const cachedIcon = cache[urlObj.hostname];
        if (!cachedIcon) return link;
        if (
          !link.icon ||
          link.icon.includes('faviconextractor.com') ||
          !cachedIcon.includes('faviconextractor.com')
        ) {
          return { ...link, icon: cachedIcon };
        }
      } catch {
        return link;
      }
      return link;
    });

    setLinks(updatedLinks);
  }, []);

  /**
   * 初始化：从 localStorage 加载数据
   *
   * 处理流程：
   * 1. 解析存储的 JSON 数据
   * 2. 确保"常用推荐"分类始终在第一位
   * 3. 校验分类图标和链接 URL 的合法性
   * 4. 将孤儿链接（分类已删除）移动到兜底分类
   * 5. 加载 favicon 缓存
   * 6. 如有数据修正，重新持久化
   */
  useEffect(() => {
    const seedLocale = APP_LANGUAGE;
    const seedCategories = buildSeedCategories(seedLocale);
    const seedLinks = buildSeedLinks(seedLocale);

    const stored = safeLocalStorageGetItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        let loadedCategories =
          parsed.categories && parsed.categories.length > 0 ? parsed.categories : seedCategories;

        // 如果"常用推荐"分类存在，确保它是第一个分类
        const commonIndex = loadedCategories.findIndex((c: Category) => c.id === 'common');
        if (commonIndex > 0) {
          const commonCategory = loadedCategories[commonIndex];
          loadedCategories = [
            commonCategory,
            ...loadedCategories.slice(0, commonIndex),
            ...loadedCategories.slice(commonIndex + 1),
          ];
        }

        const {
          categories: sanitizedCategories,
          didChange: categoriesChangedRaw,
          invalidIcons,
        } = sanitizeCategories(loadedCategories);
        let categoriesChanged = categoriesChangedRaw;
        loadedCategories = sanitizedCategories;

        // 检查是否有链接的categoryId不存在于当前分类中，将这些链接移动到默认分类
        const validCategoryIds = new Set(loadedCategories.map((c: Category) => c.id));
        const fallbackCategoryId =
          loadedCategories.find((c: Category) => c.id === 'common')?.id || loadedCategories[0]?.id;
        let loadedLinks = parsed.links || seedLinks;
        const {
          links: sanitizedLinks,
          didChange: urlsChangedRaw,
          dropped: droppedUrls,
        } = sanitizeLinks(loadedLinks);
        let urlsChanged = urlsChangedRaw;
        loadedLinks = sanitizedLinks;
        let linksChanged = false;
        if (fallbackCategoryId) {
          loadedLinks = loadedLinks.map((link: LinkItem) => {
            if (!validCategoryIds.has(link.categoryId)) {
              linksChanged = true;
              return { ...link, categoryId: fallbackCategoryId };
            }
            return link;
          });
        }

        setLinks(loadedLinks);
        setCategories(loadedCategories);
        loadLinkIcons(loadedLinks);

        if (invalidIcons.length > 0) {
          notify(formatInvalidIconNotice(invalidIcons), 'warning');
        }

        if (droppedUrls > 0) {
          notify(
            t(
              'modals.import.filteredInvalidUrls',
              `已移除 ${droppedUrls} 条无效链接（仅支持 http/https）。`,
              { count: droppedUrls },
            ),
            'warning',
          );
        }

        if (categoriesChanged || linksChanged || urlsChanged) {
          safeLocalStorageSetItem(
            LOCAL_STORAGE_KEY,
            JSON.stringify({ links: loadedLinks, categories: loadedCategories }),
          );
        }
      } catch {
        setLinks(seedLinks);
        setCategories(seedCategories);
        loadLinkIcons(seedLinks);
      }
    } else {
      setLinks(seedLinks);
      setCategories(seedCategories);
      loadLinkIcons(seedLinks);
    }
    setIsLoaded(true);
  }, [loadLinkIcons, notify]);

  useEffect(() => {
    if (!isLoaded) return;

    const previousLanguage = lastLanguageRef.current;
    lastLanguageRef.current = currentLanguage as SupportedLanguageCode;

    if (!previousLanguage || previousLanguage === currentLanguage) return;

    const previousSeedCategories = buildSeedCategories(previousLanguage);
    const nextSeedCategories = buildSeedCategories(currentLanguage);
    const previousSeedLinks = buildSeedLinks(previousLanguage);
    const nextSeedLinks = buildSeedLinks(currentLanguage);

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

    if (didChange) {
      updateData(nextLinks, nextCategories);
    }
  }, [categories, currentLanguage, isLoaded, links, updateData]);

  /**
   * 添加新链接
   *
   * 处理逻辑：
   * - URL 校验和标准化（仅支持 http/https）
   * - 自动分配 order（追加到分类末尾）
   * - 置顶链接插入到置顶区域末尾
   * - 推荐链接自动分配 recommendedOrder
   */
  const addLink = useCallback(
    (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
      const processedUrl = normalizeHttpUrl(data.url);
      if (!processedUrl) {
        notify(t('modals.link.invalidUrl', '链接 URL 无效（仅支持 http/https）。'), 'warning');
        return;
      }

      const isRecommended = Boolean(data.recommended);
      const maxRecommendedOrder = links
        .filter((link) => link.recommended)
        .reduce((max, link) => Math.max(max, link.recommendedOrder ?? -1), -1);
      const recommendedOrder = isRecommended
        ? (data.recommendedOrder ?? maxRecommendedOrder + 1)
        : undefined;

      const categoryLinks = links.filter(
        (link) =>
          !link.pinned && (data.categoryId === 'all' || link.categoryId === data.categoryId),
      );

      const maxOrder =
        categoryLinks.length > 0 ? Math.max(...categoryLinks.map((link) => link.order || 0)) : -1;

      const newLink: LinkItem = {
        ...data,
        url: processedUrl,
        id: generateId(),
        createdAt: Date.now(),
        order: maxOrder + 1,
        pinnedOrder: data.pinned ? links.filter((l) => l.pinned).length : undefined,
        recommended: isRecommended,
        recommendedOrder,
      };

      if (newLink.pinned) {
        const firstNonPinnedIndex = links.findIndex((link) => !link.pinned);
        if (firstNonPinnedIndex === -1) {
          updateData([...links, newLink], categories);
        } else {
          const updatedLinks = [...links];
          updatedLinks.splice(firstNonPinnedIndex, 0, newLink);
          updateData(updatedLinks, categories);
        }
      } else {
        const updatedLinks = [...links, newLink].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const aOrder = a.order !== undefined ? a.order : a.createdAt;
          const bOrder = b.order !== undefined ? b.order : b.createdAt;
          return aOrder - bOrder;
        });
        updateData(updatedLinks, categories);
      }
    },
    [links, categories, updateData, notify],
  );

  /**
   * 更新链接
   *
   * 保留原有的 createdAt，更新其他字段。
   * 特殊处理 recommended 和 recommendedOrder 的联动逻辑。
   */
  const updateLink = useCallback(
    (data: Omit<LinkItem, 'createdAt'>) => {
      const processedUrl = normalizeHttpUrl(data.url);
      if (!processedUrl) {
        notify(t('modals.link.invalidUrl', '链接 URL 无效（仅支持 http/https）。'), 'warning');
        return;
      }
      const existing = links.find((l) => l.id === data.id);
      if (!existing) return;

      const recommendedProvided = Object.hasOwn(data, 'recommended');
      const nextRecommended = recommendedProvided
        ? Boolean(data.recommended)
        : Boolean(existing.recommended);

      const recommendedOrderProvided = Object.hasOwn(data, 'recommendedOrder');
      const nextRecommendedOrderInput = recommendedOrderProvided
        ? data.recommendedOrder
        : existing.recommendedOrder;

      let nextRecommendedOrder: number | undefined = nextRecommendedOrderInput;
      if (nextRecommended) {
        if (typeof nextRecommendedOrder !== 'number') {
          const maxRecommendedOrder = links
            .filter((link) => link.id !== data.id && link.recommended)
            .reduce((max, link) => Math.max(max, link.recommendedOrder ?? -1), -1);
          nextRecommendedOrder = maxRecommendedOrder + 1;
        }
      } else {
        nextRecommendedOrder = undefined;
      }

      const updated = links.map((l) =>
        l.id === data.id
          ? {
              ...l,
              ...data,
              url: processedUrl,
              recommended: nextRecommended,
              recommendedOrder: nextRecommendedOrder,
            }
          : l,
      );
      updateData(updated, categories);
    },
    [links, categories, updateData, notify],
  );

  /** 删除链接 */
  const deleteLink = useCallback(
    (id: string) => {
      updateData(
        links.filter((l) => l.id !== id),
        categories,
      );
    },
    [links, categories, updateData],
  );

  /**
   * 记录管理员点击统计
   *
   * 用于"常用推荐"的智能排序：记录管理员的点击次数和最后点击时间，
   * 便于后续根据使用频率自动调整推荐顺序。
   */
  const recordAdminLinkClick = useCallback(
    (id: string) => {
      const updatedLinks = links.map((link) => {
        if (link.id !== id) return link;
        return {
          ...link,
          adminClicks: (link.adminClicks ?? 0) + 1,
          adminLastClickedAt: Date.now(),
        };
      });
      updateData(updatedLinks, categories);
    },
    [links, categories, updateData],
  );

  /** 切换链接置顶状态 */
  const togglePin = useCallback(
    (id: string) => {
      const linkToToggle = links.find((l) => l.id === id);
      if (!linkToToggle) return;

      const updated = links.map((l) => {
        if (l.id === id) {
          const isPinned = !l.pinned;
          return {
            ...l,
            pinned: isPinned,
            pinnedOrder: isPinned ? links.filter((link) => link.pinned).length : undefined,
          };
        }
        return l;
      });
      updateData(updated, categories);
    },
    [links, categories, updateData],
  );

  /**
   * 重排链接顺序（拖拽排序）
   *
   * 根据当前选中的分类，在该分类内重新排序：
   * - "常用推荐"分类：更新 recommendedOrder
   * - 其他分类：更新 order
   *
   * 使用 @dnd-kit 的 arrayMove 实现数组元素移动。
   */
  const reorderLinks = useCallback(
    (activeId: string, overId: string, selectedCategory: string) => {
      if (activeId === overId) return;

      if (selectedCategory === COMMON_CATEGORY_ID) {
        const commonLinks = getCommonRecommendedLinks(links);
        const activeIndex = commonLinks.findIndex((link) => link.id === activeId);
        const overIndex = commonLinks.findIndex((link) => link.id === overId);
        if (activeIndex === -1 || overIndex === -1) return;

        const reorderedCommonLinks = arrayMove(commonLinks, activeIndex, overIndex) as LinkItem[];
        const recommendedOrderMap = new Map<string, number>();
        reorderedCommonLinks.forEach((link, index) => {
          recommendedOrderMap.set(link.id, index);
        });

        const updatedLinks = links.map((link) => {
          const nextOrder = recommendedOrderMap.get(link.id);
          if (nextOrder === undefined) return link;

          const isAlreadyManual =
            Boolean(link.recommended) || link.categoryId === COMMON_CATEGORY_ID;
          return {
            ...link,
            recommended: isAlreadyManual ? link.recommended : true,
            recommendedOrder: nextOrder,
          };
        });

        updateData(updatedLinks, categories);
        return;
      }

      const getOrderValue = (link: LinkItem) =>
        link.order !== undefined ? link.order : link.createdAt;

      const categoryLinks = links
        .filter((link) => selectedCategory === 'all' || link.categoryId === selectedCategory)
        .slice()
        .sort((a, b) => getOrderValue(a) - getOrderValue(b));

      const activeIndex = categoryLinks.findIndex((link) => link.id === activeId);
      const overIndex = categoryLinks.findIndex((link) => link.id === overId);

      if (activeIndex !== -1 && overIndex !== -1) {
        const reorderedCategoryLinks = arrayMove(
          categoryLinks,
          activeIndex,
          overIndex,
        ) as LinkItem[];
        const updatedLinks = links.map((link) => {
          const reorderedIndex = reorderedCategoryLinks.findIndex((l) => l.id === link.id);
          if (reorderedIndex !== -1) {
            return { ...link, order: reorderedIndex };
          }
          return link;
        });
        updatedLinks.sort((a, b) => getOrderValue(a) - getOrderValue(b));
        updateData(updatedLinks, categories);
      }
    },
    [links, categories, updateData],
  );

  /**
   * 重排置顶链接顺序
   *
   * 置顶链接独立于分类排序，使用 pinnedOrder 字段控制显示顺序。
   */
  const reorderPinnedLinks = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return;

      const pinnedLinksList = links
        .filter((link) => link.pinned)
        .slice()
        .sort((a, b) => {
          if (a.pinnedOrder !== undefined && b.pinnedOrder !== undefined) {
            return a.pinnedOrder - b.pinnedOrder;
          }
          if (a.pinnedOrder !== undefined) return -1;
          if (b.pinnedOrder !== undefined) return 1;
          return a.createdAt - b.createdAt;
        });
      const activeIndex = pinnedLinksList.findIndex((link) => link.id === activeId);
      const overIndex = pinnedLinksList.findIndex((link) => link.id === overId);

      if (activeIndex !== -1 && overIndex !== -1) {
        const reorderedPinnedLinks = arrayMove(
          pinnedLinksList,
          activeIndex,
          overIndex,
        ) as LinkItem[];
        const pinnedOrderMap = new Map<string, number>();
        reorderedPinnedLinks.forEach((link, index) => {
          pinnedOrderMap.set(link.id, index);
        });

        const updatedLinks = links.map((link) => {
          if (link.pinned) {
            return { ...link, pinnedOrder: pinnedOrderMap.get(link.id) };
          }
          return link;
        });

        updatedLinks.sort((a, b) => {
          if (a.pinned && b.pinned) {
            return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
          }
          if (a.pinned) return -1;
          if (b.pinned) return 1;
          const aOrder = a.order !== undefined ? a.order : a.createdAt;
          const bOrder = b.order !== undefined ? b.order : b.createdAt;
          return bOrder - aOrder;
        });
        updateData(updatedLinks, categories);
      }
    },
    [links, categories, updateData],
  );

  /**
   * 删除分类
   *
   * 删除后将该分类下的所有链接移动到"常用推荐"或第一个分类。
   * 至少保留一个分类，防止数据孤立。
   */
  const deleteCategory = useCallback(
    (catId: string) => {
      if (categories.length <= 1) {
        notify(t('modals.category.keepAtLeastOne', '至少保留一个分类'), 'warning');
        return;
      }
      const newCats = categories.filter((c) => c.id !== catId);
      if (newCats.length === categories.length) return;
      const fallbackCategory = newCats.find((c) => c.id === 'common') || newCats[0];
      const newLinks = links.map((l) =>
        l.categoryId === catId ? { ...l, categoryId: fallbackCategory.id } : l,
      );
      updateData(newLinks, newCats);
    },
    [links, categories, updateData, notify],
  );

  /**
   * 导入数据（合并模式）
   *
   * 将导入的链接和分类与现有数据合并：
   * - 分类：按 id 或 name 去重
   * - 链接：直接追加（不去重）
   */
  const importData = useCallback(
    (newLinks: LinkItem[], newCategories: Category[]) => {
      const mergedCategories = [...categories];
      newCategories.forEach((nc) => {
        if (!mergedCategories.some((c) => c.id === nc.id || c.name === nc.name)) {
          mergedCategories.push(nc);
        }
      });
      const mergedLinks = [...links, ...newLinks];
      updateData(mergedLinks, mergedCategories);
    },
    [links, categories, updateData],
  );

  return {
    links,
    categories,
    setLinks,
    setCategories,
    updateData,
    isLoaded,
    addLink,
    updateLink,
    deleteLink,
    recordAdminLinkClick,
    togglePin,
    reorderLinks,
    reorderPinnedLinks,
    deleteCategory,
    importData,
  };
};
