import { LinkItem } from '../types';
import { COMMON_CATEGORY_ID } from './constants';

/**
 * === 常用推荐（common）自动纳入配置 ===
 *
 * 你可以在这里自定义“自动纳入常用推荐”的指标与阈值：
 * - 指标：修改 getAutoCommonRecommendScore()
 * - 阈值：修改 AUTO_COMMON_RECOMMEND_MIN_SCORE
 * - 数量：修改 AUTO_COMMON_RECOMMEND_MAX_ITEMS
 */
export const AUTO_COMMON_RECOMMEND_MIN_SCORE = 15;
export const AUTO_COMMON_RECOMMEND_MAX_ITEMS = 12;

const commonRecommendedCache = new WeakMap<LinkItem[], LinkItem[]>();

export function getAutoCommonRecommendScore(link: LinkItem): number {
  // 默认指标：管理员模式下的点击次数
  return link.adminClicks ?? 0;
}

export function getCommonRecommendedLinks(links: LinkItem[]): LinkItem[] {
  const cached = commonRecommendedCache.get(links);
  if (cached) return cached;

  const manualRecommended = links.filter(
    (link) => link.recommended || link.categoryId === COMMON_CATEGORY_ID,
  );
  const manualIds = new Set(manualRecommended.map((link) => link.id));

  const manualSorted = manualRecommended.slice().sort((a, b) => {
    const aOrder = a.recommendedOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.recommendedOrder ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.createdAt - b.createdAt;
  });

  const autoCandidates = links
    .filter((link) => !manualIds.has(link.id))
    .map((link) => ({ link, score: getAutoCommonRecommendScore(link) }))
    .filter(({ score }) => score >= AUTO_COMMON_RECOMMEND_MIN_SCORE)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.link.createdAt - b.link.createdAt;
    })
    .slice(0, AUTO_COMMON_RECOMMEND_MAX_ITEMS)
    .map(({ link }) => link);

  const result = [...manualSorted, ...autoCandidates];
  commonRecommendedCache.set(links, result);
  return result;
}
