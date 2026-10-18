import raw from './copy/preparation.json';
import type { Locale } from '../i18n/locales';

export const PREPARATION_HEADINGS: Record<Locale, string> = {
  pl: 'Jak przygotować się do rozmowy?', ru: 'Что подготовить перед обращением', en: 'What to prepare for your enquiry',
};
export const SERVICE_PREPARATION: Record<Locale, Record<string, string>> = raw;

/** Explicitly empty owner text stays empty; missing fields gain current defaults. */
export function withServicePreparation<T extends { slug: string; preparation?: string }>(services: T[], locale: Locale) {
  return services.map(service => ({ ...service, preparation: service.preparation ?? SERVICE_PREPARATION[locale][service.slug] ?? '' }));
}
