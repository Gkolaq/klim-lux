import type { APIRoute } from 'astro';
import { SITE_URL } from '../config/site';
import { LOCALES, HREFLANG, type Locale } from '../i18n/locales';
import { publicPageGroups, pageUrl } from '../seo/pages';

const escape = (value: string) => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);

export const GET: APIRoute = ({ locals }) => {
  const data = locals.snapshot.content;
  const entries = publicPageGroups(data).flatMap(group => {
    const locales = LOCALES.filter(locale => !!group.paths[locale]);
    const alternate = (locale: Locale) => pageUrl(locale, group.paths[locale]!);
    const alternates = locales.map(locale => '<xhtml:link rel="alternate" hreflang="' + HREFLANG[locale] + '" href="' + escape(alternate(locale)) + '"/>').join('');
    const defaultLocale = locales.includes('pl') ? 'pl' : locales[0];
    const xDefault = '<xhtml:link rel="alternate" hreflang="x-default" href="' + escape(alternate(defaultLocale)) + '"/>';
    const image = group.image ? '<image:image><image:loc>' + escape(new URL(group.image, SITE_URL).href) + '</image:loc></image:image>' : '';
    return locales.map(locale => {
      const url = alternate(locale), modified = data.seoUpdatedAt[url] ?? group.modified;
      return '<url><loc>' + escape(url) + '</loc>' + (modified ? '<lastmod>' + escape(modified) + '</lastmod>' : '') + alternates + xDefault + image + '</url>';
    });
  }).join('');
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">' + entries + '</urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
