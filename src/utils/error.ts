/**
 * Error Utility Module
 * 错误处理工具模块
 *
 * Provides utilities for extracting error messages from various error types.
 * 提供从各种错误类型中提取错误消息的工具函数。
 */

/**
 * Extract error message from unknown error type
 * 从未知错误类型中提取错误消息
 *
 * Handles multiple error formats:
 * 处理多种错误格式：
 * - Error instances / Error 实例
 * - String errors / 字符串错误
 * - Objects with message property / 带有 message 属性的对象
 *
 * @param error - The error to extract message from / 要提取消息的错误
 * @param fallback - Default message if extraction fails / 提取失败时的默认消息
 * @returns Extracted error message / 提取的错误消息
 *
 * @example
 * getErrorMessage(new Error('Something went wrong'))
 * // => 'Something went wrong'
 *
 * getErrorMessage({ message: 'API failed' })
 * // => 'API failed'
 *
 * getErrorMessage(null)
 * // => 'Unknown error'
 */
export const getErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  // Handle Error instances / 处理 Error 实例
  if (error instanceof Error) {
    return error.message && error.message.trim() ? error.message : fallback;
  }

  // Handle string errors / 处理字符串错误
  if (typeof error === 'string') {
    return error.trim() ? error : fallback;
  }

  // Handle objects with message property / 处理带有 message 属性的对象
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }

  return fallback;
};
