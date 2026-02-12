/**
 * Export Service
 * 导出服务
 *
 * Provides functionality to export bookmarks in various formats.
 * 提供将书签导出为各种格式的功能。
 *
 * Supported formats / 支持的格式:
 * - HTML (Netscape Bookmark format) - Compatible with all browsers
 *   HTML（Netscape 书签格式）- 适用于所有主流浏览器
 * - JSON - For backup and data transfer
 *   JSON - 用于备份和数据传输
 */

import i18n from '../config/i18n';
import type { Category, CountdownItem, LinkItem } from '../types';

/**
 * Generate Netscape Bookmark HTML string
 * 生成 Netscape 书签格式的 HTML 字符串
 *
 * Creates a bookmark file that can be imported by Chrome, Edge, Firefox, Safari.
 * 创建可被 Chrome、Edge、Firefox、Safari 导入的书签文件。
 *
 * @param links - Array of links to export / 要导出的链接数组
 * @param categories - Array of categories / 分类数组
 * @returns HTML string in Netscape Bookmark format / Netscape 书签格式的 HTML 字符串
 */
export const generateBookmarkHtml = (links: LinkItem[], categories: Category[]): string => {
  // Current timestamp in seconds / 当前时间戳（秒）
  const now = Math.floor(Date.now() / 1000);

  // HTML header (required for browser import)
  // HTML 头部（浏览器导入所需）
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  /**
   * Escape HTML special characters to prevent XSS
   * 转义 HTML 特殊字符以防止 XSS
   */
  const escapeHtml = (unsafe: string) => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Group links by category / 按分类分组链接
  const linksByCat = new Map<string, LinkItem[]>();
  links.forEach((link) => {
    const list = linksByCat.get(link.categoryId) || [];
    list.push(link);
    linksByCat.set(link.categoryId, list);
  });

  // 1. Process each category / 处理每个分类
  categories.forEach((cat) => {
    const catLinks = linksByCat.get(cat.id) || [];

    // Category folder header / 分类文件夹头部
    html += `    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">${escapeHtml(cat.name)}</H3>\n`;
    html += `    <DL><p>\n`;

    // Links in this category / 该分类下的链接
    catLinks.forEach((link) => {
      const date = Math.floor(link.createdAt / 1000);
      const iconAttr = link.icon ? ` ICON="${escapeHtml(link.icon)}"` : '';
      html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${date}"${iconAttr}>${escapeHtml(link.title)}</A>\n`;
    });

    html += `    </DL><p>\n`;
  });

  // 2. Process uncategorized links (links with invalid categoryId)
  // 处理未分类的链接（categoryId 无效的链接）
  const validCatIds = new Set(categories.map((c) => c.id));
  const uncategorized = links.filter((l) => !validCatIds.has(l.categoryId));

  if (uncategorized.length > 0) {
    html += `    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">${escapeHtml(i18n.t('common.uncategorized'))}</H3>\n`;
    html += `    <DL><p>\n`;
    uncategorized.forEach((link) => {
      const date = Math.floor(link.createdAt / 1000);
      html += `        <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${date}">${escapeHtml(link.title)}</A>\n`;
    });
    html += `    </DL><p>\n`;
  }

  html += `</DL><p>`;

  return html;
};

/**
 * Trigger file download in browser
 * 在浏览器中触发文件下载
 *
 * Creates a temporary link element to download the blob.
 * 创建临时链接元素来下载 blob。
 *
 * @param blob - File content as Blob / 文件内容（Blob 格式）
 * @param filename - Download filename / 下载文件名
 */
const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Clean up object URL to free memory / 清理对象 URL 以释放内存
  URL.revokeObjectURL(url);
};

/**
 * Download HTML file
 * 下载 HTML 文件
 *
 * @param content - HTML content string / HTML 内容字符串
 * @param filename - Download filename / 下载文件名
 */
export const downloadHtmlFile = (content: string, filename: string = 'bookmarks.html') => {
  const blob = new Blob([content], { type: 'text/html' });
  triggerDownload(blob, filename);
};

/**
 * Download JSON file
 * 下载 JSON 文件
 *
 * @param data - Data to export (will be stringified if not string)
 *              要导出的数据（如果不是字符串会被序列化）
 * @param filename - Download filename / 下载文件名
 */
export const downloadJsonFile = (data: unknown, filename: string = 'navhub_backup.json') => {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  triggerDownload(blob, filename);
};

/**
 * Fold long lines per RFC 5545 (max 75 octets per line).
 */
const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      parts.push(line.slice(0, 75));
      i = 75;
    } else {
      parts.push(' ' + line.slice(i, i + 74));
      i += 74;
    }
  }
  return parts.join('\r\n');
};

/**
 * Escape text for ICS property values per RFC 5545.
 */
const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/**
 * Format a Date as ICS UTC datetime: 20260215T093000Z
 */
const formatIcsDateTimeUtc = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
};

/**
 * Format a date-only ICS value: 20260215
 */
const formatIcsDate = (isoString: string): string => {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};

/**
 * Map CountdownRule to RRULE string. Returns empty string if no mapping.
 */
const ruleToRrule = (rule: CountdownItem['rule']): string => {
  if (rule.kind === 'once') return '';
  if (rule.kind !== 'interval') return ''; // cron, lunarYearly, solarTermYearly have no ICS equivalent

  const unitMap: Record<string, string> = {
    day: 'DAILY',
    week: 'WEEKLY',
    month: 'MONTHLY',
    year: 'YEARLY',
  };
  const freq = unitMap[rule.unit];
  if (!freq) return '';
  return rule.every === 1 ? `RRULE:FREQ=${freq}` : `RRULE:FREQ=${freq};INTERVAL=${rule.every}`;
};

/**
 * Generate iCalendar (ICS) content from CountdownItem array.
 *
 * Follows RFC 5545. Excludes archived and hidden items by default.
 *
 * @param items - Countdown items to export
 * @returns ICS file content string
 */
export const generateIcsContent = (items: CountdownItem[]): string => {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NavHub//Reminder Board//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  const now = formatIcsDateTimeUtc(new Date());

  for (const item of items) {
    lines.push('BEGIN:VEVENT');

    // UID
    lines.push(foldLine(`UID:${item.id}@navhub`));

    // DTSTAMP (required)
    lines.push(`DTSTAMP:${now}`);

    // DTSTART / DTEND
    if (item.precision === 'day') {
      // All-day event
      const dateStr = formatIcsDate(item.targetDate);
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
      // DTEND next day for a single all-day event
      const endDate = new Date(item.targetDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      const endStr = formatIcsDate(endDate.toISOString());
      lines.push(`DTEND;VALUE=DATE:${endStr}`);
    } else {
      // Timed event
      const dt = formatIcsDateTimeUtc(new Date(item.targetDate));
      lines.push(`DTSTART:${dt}`);
      // 1-hour default duration
      const endDate = new Date(item.targetDate);
      endDate.setUTCHours(endDate.getUTCHours() + 1);
      lines.push(`DTEND:${formatIcsDateTimeUtc(endDate)}`);
    }

    // CREATED
    lines.push(`CREATED:${formatIcsDateTimeUtc(new Date(item.createdAt))}`);

    // SUMMARY
    lines.push(foldLine(`SUMMARY:${escapeIcsText(item.title)}`));

    // DESCRIPTION (note + checklist)
    const descParts: string[] = [];
    if (item.note) descParts.push(item.note);
    if (item.checklist && item.checklist.length > 0) {
      if (descParts.length > 0) descParts.push('');
      for (const ci of item.checklist) {
        descParts.push(`${ci.done ? '[x]' : '[ ]'} ${ci.text}`);
      }
    }
    if (descParts.length > 0) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`));
    }

    // URL
    if (item.linkedUrl) {
      lines.push(foldLine(`URL:${item.linkedUrl}`));
    }

    // CATEGORIES (tags)
    if (item.tags && item.tags.length > 0) {
      lines.push(foldLine(`CATEGORIES:${item.tags.map(escapeIcsText).join(',')}`));
    }

    // RRULE
    const rrule = ruleToRrule(item.rule);
    if (rrule) {
      lines.push(rrule);
    }

    // VALARM (reminders)
    if (item.reminderMinutes && item.reminderMinutes.length > 0) {
      for (const minutes of item.reminderMinutes) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(foldLine(`DESCRIPTION:${escapeIcsText(item.title)}`));
        lines.push(`TRIGGER:-PT${minutes}M`);
        lines.push('END:VALARM');
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

/**
 * Download ICS file
 *
 * @param content - ICS content string
 * @param filename - Download filename
 */
export const downloadIcsFile = (content: string, filename: string = 'navhub_reminders.ics') => {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  triggerDownload(blob, filename);
};
