import archive from './gallery.json';
import { BUSINESS } from '../config/site';
import { DEFAULT_TRANSLATED_COPY } from './localized-copy';
import { CAPTIONS } from './captions';
import recent from './recent-works.json';
import sourceCopy from './copy/ru.json';
import { TRANSLATED_LOCALES, type Locale, type TranslatedLocale } from '../i18n/locales';
import { UI } from '../i18n/ui';
import { withServicePreparation } from './service-preparation';
import { migrateLocaleFields } from './localization-migration';
import { DEFAULT_LIBRARY, type LibraryEntry } from './library';

import type { Category } from './categories';
export { CATEGORIES } from './categories';
export type { Category } from './categories';
export interface Work {
  id: string; title: string; description: string; date: string; category: Category;
  image: string; thumbnail: string; width: number; height: number; source: string;
  visible: boolean; featured: boolean; order: number;
}
export interface PageCopy { slug: string; title: string; lead: string; body: string; seoTitle: string; seoDescription: string; }
export interface Service extends PageCopy { category: Category; detail: string; preparation?: string; }
export interface Material { name: string; text: string; }
export interface Translation {
  business: { owner:string; city:string; hours:string; };
  home: { title:string; lead:string; note:string; seoTitle:string; seoDescription:string; };
  pages: PageCopy[];
  services: Omit<Service,'category'>[];
  materials: Material[];
  process: {title:string;text:string;}[];
  works: Record<string,{title:string;description:string}>;
}
export interface Content {
  version: 1;
  seoUpdatedAt: Record<string, string>;
  business: { name: string; email: string; phone: string; owner: string; city: string; hours: string; };
  home: { title: string; lead: string; note: string; seoTitle: string; seoDescription: string; heroId: string; };
  pages: PageCopy[]; services: Service[]; materials: Material[];
  process: { title: string; text: string; }[];
  works: Work[];
  library: LibraryEntry[];
  translations: Record<TranslatedLocale, Translation>;
}

const ARCHIVE_CORRECTIONS: Record<string,{title?:string;description?:string}> = {
  '145':{title:'Перетяжка мебели IKEA',description:'Перетяжка мебели IKEA. Фотография из архива мастерской.'},
  '146':{title:'Перетяжка и восстановление итальянского дивана',description:'Перетяжка и восстановление итальянского дивана. Фотография из архива мастерской.'},
  '147':{title:'Перетяжка итальянского кресла',description:'Перетяжка итальянского кресла. Фотография из архива мастерской.'},
  '291':{title:'Обивка углового дивана — архивная работа в Минске'},
  '251':{title:'Перетяжка углового дивана — архивная работа в Минске'},
};
const ARCHIVE_BY_ID = new Map(archive.map(work => [work.id, work]));
export function cleanLegacyWork(work: Work): Work {
  const original = ARCHIVE_BY_ID.get(work.id), correction=ARCHIVE_CORRECTIONS[work.id];
  if (!original || !correction) return work;
  return {...work,...(correction.title && work.title===original.title ? {title:correction.title}:{}),...(correction.description && work.description===original.description ? {description:correction.description}:{})};
}

// Owner photographs follow attachment order; logo attachment is not a portfolio work.
const RECENT_WORKS: Work[] = recent.map((work, order) => ({
  id: work.id, ...work.ru, date: '', category: 'upholstery', image: work.image,
  thumbnail: '/images/responsive/' + work.id + '-720.webp', width: work.width, height: work.height,
  source: '', visible: true, featured: true, order,
}));
const RECENT_IDS = new Set(RECENT_WORKS.map(work => work.id));


function withRecentWorks(works: Work[]): Work[] {
  if (RECENT_WORKS.every(work => works.some(saved => saved.id === work.id))) return works;
  const previous = new Map(works.map(work => [work.id, work]));
  return [
    ...RECENT_WORKS.map((work, order) => ({ ...structuredClone(previous.get(work.id) ?? work), order })),
    ...works.filter(work => !RECENT_IDS.has(work.id)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((work, index) => ({ ...work, order: RECENT_WORKS.length + index })),
  ];
}

export const DEFAULT_CONTENT: Content = {
  version: 1,
  seoUpdatedAt: {},
  library: structuredClone(DEFAULT_LIBRARY),
  business: { name: BUSINESS.name, email: BUSINESS.email, phone: BUSINESS.phone, owner: BUSINESS.owner, city: BUSINESS.city, hours: 'Время встречи согласовываем заранее.' },
  home: {...sourceCopy.home,heroId:'303'},
  pages: sourceCopy.pages,
  services: sourceCopy.services as Service[],
  materials: sourceCopy.materials,
  process: sourceCopy.process,
  works: [...RECENT_WORKS, ...archive.map((w, i) => cleanLegacyWork({ id: w.id, title: /^Фотография \d+$/i.test(w.title) ? w.description.split('\n')[0].slice(0,120) || 'Мягкая мебель' : w.title, description: w.description, date: w.date, category: w.category as Category, image: w.image, thumbnail: w.thumbnail, width: w.width, height: w.height, source: w.source, visible: true, featured: i < 6, order: RECENT_WORKS.length + i }))],
  translations: {
    pl:{...DEFAULT_TRANSLATED_COPY.pl,works:CAPTIONS.pl},
    en:{...DEFAULT_TRANSLATED_COPY.en,works:CAPTIONS.en},
  },
};

DEFAULT_CONTENT.services=withServicePreparation(DEFAULT_CONTENT.services,'ru');
for(const locale of TRANSLATED_LOCALES) DEFAULT_CONTENT.translations[locale].services=withServicePreparation(DEFAULT_CONTENT.translations[locale].services,locale);

// Old saved records and backups gain new fields without replacing owner edits, including deliberately empty text.
export function normalizeContent(input: Omit<Content,'translations'|'library'|'seoUpdatedAt'> & {translations?:Partial<Content['translations']>;library?:Content['library'];seoUpdatedAt?:Content['seoUpdatedAt']}): Content {
  input = migrateLocaleFields(input) as typeof input;
  const normalizedWorks = withRecentWorks(input.works);
  const translations = {} as Content['translations'];
  for (const locale of TRANSLATED_LOCALES) {
    const saved=input.translations?.[locale], defaults=DEFAULT_CONTENT.translations[locale];
    const works: Translation['works']={};
    for (const work of normalizedWorks) works[work.id]=saved?.works[work.id] ?? defaults.works[work.id] ?? {title:UI[locale].workNumber+work.id,description:''};
    translations[locale]={...(saved??structuredClone(defaults)),services:withServicePreparation(saved?.services??defaults.services,locale),works};
  }
  return {...input,seoUpdatedAt:input.seoUpdatedAt??{},library:input.library??structuredClone(DEFAULT_LIBRARY),services:withServicePreparation(input.services,'ru'),works:normalizedWorks.map(cleanLegacyWork),translations};
}
export function localizedContent(data: Content, locale: Locale): Content {
  if (locale==='ru') return data;
  const copy=data.translations[locale];
  return {...data,business:{...data.business,...copy.business},home:{...data.home,...copy.home},pages:copy.pages,
    services:data.services.map(s=>({...s,...copy.services.find(t=>t.slug===s.slug)})),materials:copy.materials,process:copy.process,
    works:data.works.map(w=>({...w,...copy.works[w.id]}))};
}

export const pageCopy = (data: Content, slug: string) => data.pages.find(p => p.slug === slug)!;
export const publicWorks = (data: Content) => data.works.filter(w => w.visible).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
export const phoneHref = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g,'');
