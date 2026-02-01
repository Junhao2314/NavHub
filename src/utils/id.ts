/**
 * ID Generation Utility
 * ID 生成工具
 *
 * Generates unique identifiers using the best available method.
 * 使用最佳可用方法生成唯一标识符。
 *
 * Priority / 优先级:
 * 1. crypto.randomUUID() - Native UUID v4 / 原生 UUID v4
 * 2. crypto.getRandomValues() - Manual UUID v4 / 手动生成 UUID v4
 * 3. Timestamp + Math.random() - Fallback / 降级方案
 */

/**
 * Crypto-like interface for type safety
 * 用于类型安全的 Crypto 接口
 */
type CryptoLike = {
  getRandomValues?: (array: Uint8Array) => void;
  randomUUID?: () => string;
};

/**
 * Convert byte array to hexadecimal string
 * 将字节数组转换为十六进制字符串
 */
const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};

/**
 * Format hex string as UUID (8-4-4-4-12)
 * 将十六进制字符串格式化为 UUID 格式 (8-4-4-4-12)
 */
const formatUuid = (hex: string): string => {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Generate a unique identifier
 * 生成唯一标识符
 *
 * Uses the most secure method available in the current environment.
 * 使用当前环境中最安全的可用方法。
 *
 * @returns Unique identifier string / 唯一标识符字符串
 *
 * @example
 * generateId()
 * // => 'f47ac10b-58cc-4372-a567-0e02b2c3d479' (UUID format)
 * // or '1a2b3c4d_xyz123' (fallback format)
 */
export const generateId = (): string => {
  const cryptoObj = (globalThis as unknown as { crypto?: CryptoLike }).crypto;

  // Method 1: Native randomUUID (best) / 方法1：原生 randomUUID（最佳）
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  // Method 2: Manual UUID v4 using getRandomValues / 方法2：使用 getRandomValues 手动生成 UUID v4
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    // Set version (4) and variant (RFC 4122) bits
    // 设置版本号 (4) 和变体位 (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytesToHex(bytes));
  }

  // Method 3: Fallback using timestamp + random / 方法3：降级方案，使用时间戳 + 随机数
  const randomPart = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}_${randomPart || '0'}`;
};
