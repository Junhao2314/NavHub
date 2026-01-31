/**
 * i18n Type Definitions
 * 国际化类型定义
 *
 * Provides TypeScript type support for react-i18next translation keys.
 * 为 react-i18next 翻译键提供 TypeScript 类型支持。
 *
 * This file extends react-i18next's type system to enable:
 * - Type-safe translation keys
 * - IDE autocomplete for translation keys
 * - Compile-time validation of translation key usage
 *
 * Requirements: 7.1
 */

import 'react-i18next';

// Import translation resources
import zhCN from '../locales/zh-CN.json';

/**
 * Translation resource type based on the Chinese translation file.
 * 基于中文翻译文件的翻译资源类型。
 *
 * We use zh-CN as the reference because it's the default/fallback language.
 * 我们使用 zh-CN 作为参考，因为它是默认/回退语言。
 */
export type TranslationResource = typeof zhCN;

/**
 * All available translation namespaces.
 * 所有可用的翻译命名空间。
 */
export type TranslationNamespace = keyof TranslationResource;

/**
 * Resources type for i18next configuration.
 * i18next 配置的资源类型。
 */
export interface Resources {
  translation: TranslationResource;
}

/**
 * Extend react-i18next module to use our custom resource types.
 * 扩展 react-i18next 模块以使用我们的自定义资源类型。
 *
 * This enables type-safe translation keys throughout the application.
 * 这使得整个应用程序中的翻译键都是类型安全的。
 */
declare module 'react-i18next' {
  interface CustomTypeOptions {
    /**
     * Default namespace for translations.
     * 翻译的默认命名空间。
     */
    defaultNS: 'translation';

    /**
     * Resource types for all supported languages.
     * 所有支持语言的资源类型。
     */
    resources: Resources;
  }
}

/**
 * Helper type to get nested keys from translation object.
 * 从翻译对象获取嵌套键的辅助类型。
 *
 * @example
 * type Keys = NestedKeyOf<TranslationResource>;
 * // Results in: 'common.save' | 'common.cancel' | 'header.title' | ...
 */
export type NestedKeyOf<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? NestedKeyOf<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
          : Prefix extends ''
            ? K
            : `${Prefix}.${K}`
        : never;
    }[keyof T]
  : never;

/**
 * All available translation keys as a union type.
 * 所有可用翻译键的联合类型。
 *
 * This type can be used for strict type checking of translation keys.
 * 此类型可用于翻译键的严格类型检查。
 */
export type TranslationKey = NestedKeyOf<TranslationResource>;
