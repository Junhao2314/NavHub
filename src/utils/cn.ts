/**
 * Class Name Utility
 * 类名工具函数
 *
 * A lightweight utility for conditionally joining class names.
 * 用于条件性拼接 CSS 类名的轻量级工具。
 */

/**
 * Valid class name value types
 * 有效的类名值类型
 * - string: actual class name / 实际的类名
 * - false/null/undefined: will be filtered out / 会被过滤掉
 */
export type ClassNameValue = string | false | null | undefined;

/**
 * Conditionally join class names
 * 条件性拼接类名
 *
 * @param values - Class name values to join / 要拼接的类名值
 * @returns Joined class name string / 拼接后的类名字符串
 *
 * @example
 * cn('btn', isActive && 'btn-active', isDisabled && 'btn-disabled')
 * // => 'btn btn-active' (if isActive is true, isDisabled is false)
 */
export const cn = (...values: ClassNameValue[]) => values.filter(Boolean).join(' ');
