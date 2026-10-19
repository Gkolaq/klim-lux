import type { Content, Work } from '../data/content';
import { localizedContent, publicWorks } from '../data/content';
import { relatedServices } from '../data/service-links';
import { publicLibrary } from '../data/library';
import { AUTHORED_ARTICLES, articleBasePath } from '../data/articles';
import { LOCALES, localePath, type Locale } from '../i18n/locales';
import { SITE_URL } from '../config/site';

import {PORTFOLIO_PAGE_SIZE,LIBRARY_PAGE_SIZE} from './pagination';
export {PORTFOLIO_PAGE_SIZE,LIBRARY_PAGE_SIZE} from './pagination';
export interface PageGroup {
  key: string;
  paths: Partial<Record<Locale, string>>;
  image?: string;
  modified?: string;
}
const pathsFor = (path: string) => Object.fromEntries(LOCALES.map(locale => [locale, path])) as Record<Locale, string>;
export const pageUrl = (locale: Locale, path: string) => SITE_URL + localePath(locale, path);
export function canonicalPath(pathname: string, page = 1): string {
  return pathname + (page > 1 ? '?page=' + page : '');
}

/** One public inventory shared by the sitemap, change tracking and search notifications. */
export function publicPageGroups(content: Content): PageGroup[] {
  const works = publicWorks(content), books = publicLibrary(content);
  const groups: PageGroup[] = [
    ...['/', '/library/', ...content.pages.map(page => '/' + page.slug + '/'), ...content.services.map(service => '/services/' + service.slug + '/')].map(path => ({ key: path, paths: pathsFor(path) })),
    ...works.map(work => ({ key: '/portfolio/' + work.id + '/', paths: pathsFor('/portfolio/' + work.id + '/'), image: work.image })),
    ...books.map(book => ({ key: '/library/' + book.id + '/', paths: pathsFor('/library/' + book.id + '/') })),
  ];
  for (const [path, count, size] of [['/portfolio/', works.length, PORTFOLIO_PAGE_SIZE], ['/library/', books.length, LIBRARY_PAGE_SIZE]] as const) {
    for (let page = 2; page <= Math.ceil(count / size); page++) {
      const key = canonicalPath(path, page);
      groups.push({ key, paths: pathsFor(key) });
    }
  }
  for (const group of new Set(AUTHORED_ARTICLES.map(article => article.group))) {
    const editions = AUTHORED_ARTICLES.filter(article => article.group === group);
    groups.push({ key: 'article:' + group, paths: Object.fromEntries(editions.map(article => [article.language, articleBasePath(article)])), modified: editions[0].modified });
  }
  return groups;
}
export const publicPageUrls = (content: Content) => publicPageGroups(content).flatMap(group => LOCALES.flatMap(locale => group.paths[locale] ? [pageUrl(locale, group.paths[locale]!)] : []));

const card = (work: Work | undefined) => work ? [work.id, work.title, work.date, work.category, work.image, work.thumbnail, work.width, work.height] : null;
const edition = (book: Content['library'][number] | undefined) => book ? [book.id, book.title, book.year, book.language] : null;

/** Signatures describe rendered content; SEO timestamps themselves cannot trigger updates. */
function pageStates(content: Content): Map<string, string> {
  const groups = publicPageGroups(content), states = new Map<string, string>();
  for (const locale of LOCALES) {
    const data = localizedContent(content, locale), works = publicWorks(data), books = publicLibrary(data);
    const copy = (slug: string) => data.pages.find(page => page.slug === slug);
    for (const group of groups) {
      const path = group.paths[locale];
      if (!path) continue;
      const parsed = new URL(path, SITE_URL), base = parsed.pathname, page = Number(parsed.searchParams.get('page') || 1);
      let model: unknown;
      if (base === '/') {
        const featured = works.filter(work => work.featured).slice(0, 6);
        model = [data.home, card(works.find(work => work.id === data.home.heroId) || works[0]), (featured.length ? featured : works.slice(0, 6)).map(card), works.length, data.services.map(service => [service.slug, service.title, service.lead]), copy('workshop')?.lead];
      } else if (base === '/services/') {
        model = [copy('services'), data.services.map(service => [service.slug, service.title, service.lead, service.body, card(works.find(work => work.category === service.category))])];
      } else if (base.startsWith('/services/')) {
        const service = data.services.find(service => base === '/services/' + service.slug + '/');
        model = [service, works.filter(work => work.category === service?.category).slice(0, 6).map(card), relatedServices(data.services, service?.slug ?? '').map(item => [item.slug, item.title, item.lead])];
      } else if (base === '/portfolio/') {
        const counts = Object.fromEntries(['upholstery', 'covers', 'custom', 'mechanisms'].map(category => [category, works.filter(work => work.category === category).length]));
        model = [copy('portfolio'), works.length, counts, works.slice((page - 1) * PORTFOLIO_PAGE_SIZE, page * PORTFOLIO_PAGE_SIZE).map(card)];
      } else if (base.startsWith('/portfolio/')) {
        const index = works.findIndex(work => base === '/portfolio/' + work.id + '/'), work = works[index];
        const linkedService = data.services.find(service => service.category === work?.category);
        model = [work, index, works.length, works[(index - 1 + works.length) % works.length]?.id, works[(index + 1) % works.length]?.id, works.filter(other => other.id !== work?.id && other.category === work?.category).slice(0, 3).map(card), linkedService ? [linkedService.slug, linkedService.title] : null];
      } else if (base === '/materials/') {
        model = [copy('materials'), data.materials, AUTHORED_ARTICLES.filter(article => article.language === locale)];
      } else if (base === '/workshop/') {
        model = [copy('workshop'), data.process, card(works.find(work => work.category === 'covers'))];
      } else if (base === '/contacts/') {
        model = copy('contacts');
      } else if (base === '/library/') {
        model = [books.map(edition), books.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE).map(book => ({ ...book, descriptions: book.descriptions[locale] }))];
      } else if (base.startsWith('/library/')) {
        const book = books.find(book => base === '/library/' + book.id + '/');
        model = [book ? { ...book, descriptions: book.descriptions[locale] } : null, edition(books.find(other => other.id === book?.translationOf)), books.filter(other => other.translationOf === book?.id).map(edition)];
      } else {
        model = AUTHORED_ARTICLES.find(article => article.language === locale && articleBasePath(article) === base);
      }
      states.set(pageUrl(locale, path), JSON.stringify([data.business, model]));
    }
  }
  return states;
}
export function changedPageUrls(before: Content, after: Content): string[] {
  const previous = pageStates(before), current = pageStates(after);
  return [...new Set([...previous.keys(), ...current.keys()])].filter(url => previous.get(url) !== current.get(url));
}
export function withPageModifiedDates(before: Content, after: Content, at: string): Content {
  const seoUpdatedAt = { ...before.seoUpdatedAt };
  for (const url of changedPageUrls(before, after)) seoUpdatedAt[url] = at;
  return { ...after, seoUpdatedAt };
}

