import type { Locale } from '../i18n/locales';
import { LANGUAGE_NAMES } from '../i18n/locales';
import defaults from './library-defaults.json';

export const LIBRARY_CATEGORIES = ['techniques', 'materials', 'restoration', 'patterns', 'reference'] as const;
export const LIBRARY_RIGHTS = ['source-only', 'original', 'permission', 'open-license', 'public-domain'] as const;
// A publication's original language is metadata, independent of public website editions.
export const PUBLICATION_LANGUAGE_NAMES = { ...LANGUAGE_NAMES, be: 'Беларуская', uk: 'Українська' };
export type PublicationLanguage = keyof typeof PUBLICATION_LANGUAGE_NAMES;
export interface LibraryEntry {
  id: string; title: string; author: string; publisher: string; year: string;
  language: PublicationLanguage; kind: 'book' | 'learning' | 'reference'; category: typeof LIBRARY_CATEGORIES[number];
  descriptions: Record<Locale, string>;
  sourceUrl: string; externalDownloadUrl: string; fileId: string;
  rights: typeof LIBRARY_RIGHTS[number]; rightsNote: string;
  translationOf: string; translator: string; visible: boolean; order: number;
}
export const DEFAULT_LIBRARY = defaults as LibraryEntry[];
export const publicLibrary = (data: { library: LibraryEntry[] }) => data.library.filter(item => item.visible).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
export const libraryDescription = (item: LibraryEntry, locale: Locale) => item.descriptions[locale] || item.descriptions.ru || item.descriptions.pl;
export const canHostLibraryFile = (item: LibraryEntry) => item.rights !== 'source-only' && item.rightsNote.trim().length > 0;
