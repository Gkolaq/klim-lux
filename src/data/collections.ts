import type { Content } from './content';
import { publicWorks } from './content';
import { publicLibrary, libraryDescription } from './library';
import { LIBRARY_UI } from '../i18n/library';
import type { Locale } from '../i18n/locales';
import { pageWindow, PORTFOLIO_PAGE_SIZE, LIBRARY_PAGE_SIZE } from '../seo/pagination';

export function portfolioSelection(data: Content, locale: Locale, params: URLSearchParams) {
  const all = publicWorks(data), category = params.get('category') || '';
  const q = (params.get('q') || '').trim().slice(0, 120), normalised = q.toLocaleLowerCase(locale);
  const filtered = all.filter(work => (!category || work.category === category) && (!normalised || (work.title + ' ' + work.description).toLocaleLowerCase(locale).includes(normalised)));
  const window = pageWindow(filtered.length, PORTFOLIO_PAGE_SIZE, params.get('page'));
  return { all, category, q, filtered, ...window, shown: filtered.slice(window.start, window.start + PORTFOLIO_PAGE_SIZE), filteredView: Boolean(q || category) };
}
export function librarySelection(data: Content, locale: Locale, params: URLSearchParams) {
  const all = publicLibrary(data), t = LIBRARY_UI[locale];
  const q = (params.get('q') || '').trim().slice(0, 120), lang = params.get('language') || '', category = params.get('category') || '';
  const filtered = all.filter(item => (!lang || item.language === lang) && (!category || item.category === category) && (!q || [item.title, item.author, item.publisher, libraryDescription(item, locale), t.categories[item.category]].join(' ').toLocaleLowerCase(locale).includes(q.toLocaleLowerCase(locale))));
  const window = pageWindow(filtered.length, LIBRARY_PAGE_SIZE, params.get('page'));
  return { all, q, lang, category, filtered, ...window, shown: filtered.slice(window.start, window.start + LIBRARY_PAGE_SIZE), filteredView: Boolean(q || lang || category) };
}

