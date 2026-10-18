/** Public website languages. Retired routes are handled separately below. */
export const LOCALES = ['pl', 'ru', 'en'] as const;
export type Locale = typeof LOCALES[number];
export type TranslatedLocale = Exclude<Locale, 'ru'>;
export const TRANSLATED_LOCALES = ['pl', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'pl';
export const LANGUAGE_NAMES: Record<Locale, string> = { pl: 'Polski', ru: 'Русский', en: 'English' };
export const HREFLANG: Record<Locale, string> = { pl: 'pl-PL', ru: 'ru', en: 'en' };
export const OG_LOCALE: Record<Locale, string> = { pl: 'pl_PL', ru: 'ru_RU', en: 'en_GB' };
export const DATE_LOCALES: Record<Locale, string> = { pl: 'pl-PL', ru: 'ru-RU', en: 'en-GB' };
export const LANGUAGE_COOKIE = 'klim_locale';
export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && LOCALES.includes(value as Locale);
export const localePath = (locale: Locale, path = '/') => '/' + locale + (path.startsWith('/') ? path : '/' + path);
export const pathWithoutLocale = (path: string) => path.replace(/^\/(?:pl|ru|en)(?=\/|$)/, '') || '/';

/** Preserve old bookmarks without serving retired language editions. */
export function retiredLocalePath(path: string): string | undefined {
  return /^\/(?:be|uk)(?=\/|$)/.test(path) ? path.replace(/^\/(?:be|uk)(?=\/|$)/, '/ru') : undefined;
}
