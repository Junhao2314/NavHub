/**
 * URL Utility Module
 * URL 工具模块
 *
 * Provides URL validation and normalization utilities.
 * 提供 URL 验证和标准化工具。
 */

/**
 * Regex to detect if string has a URL scheme
 * 用于检测字符串是否包含 URL 协议的正则表达式
 */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalize a user-provided URL string for safe opening
 * 标准化用户输入的 URL 字符串以便安全打开
 *
 * Security features / 安全特性:
 * - Adds `https://` when scheme is missing / 缺少协议时自动添加 https://
 * - Only allows `http:` and `https:` protocols / 仅允许 http: 和 https: 协议
 * - Blocks dangerous schemes like `javascript:`, `data:`, etc.
 *   阻止危险协议如 javascript:、data: 等
 *
 * @param input - User-provided URL string / 用户输入的 URL 字符串
 * @returns Normalized URL or null if invalid / 标准化后的 URL，无效时返回 null
 *
 * @example
 * normalizeHttpUrl('github.com')
 * // => 'https://github.com'
 *
 * normalizeHttpUrl('http://example.com')
 * // => 'http://example.com'
 *
 * normalizeHttpUrl('javascript:alert(1)')
 * // => null (blocked for security / 因安全原因被阻止)
 */
export const normalizeHttpUrl = (input: string): string | null => {
  // Validate input type / 验证输入类型
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Reject relative paths, query strings, and fragments
  // 拒绝相对路径、查询字符串和片段标识符
  if (
    (trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
    trimmed.startsWith('?') ||
    trimmed.startsWith('#')
  )
    return null;

  // Add https:// if no scheme present / 如果没有协议则添加 https://
  let candidate = trimmed;
  if (trimmed.startsWith('//')) {
    candidate = `https:${trimmed}`;
  } else if (!HAS_SCHEME_RE.test(trimmed)) {
    candidate = `https://${trimmed}`;
  }

  // Parse and validate URL / 解析并验证 URL
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  // Only allow http and https protocols / 仅允许 http 和 https 协议
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;

  return candidate;
};
