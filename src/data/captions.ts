import pl from './captions/pl.json';
import en from './captions/en.json';
import type { TranslatedLocale } from '../i18n/locales';

export const CAPTIONS: Record<TranslatedLocale, Record<string, { title: string; description: string }>> = { pl, en };

