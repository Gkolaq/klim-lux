import type { Locale } from './locales';
import { MESSAGES } from './messages';

export const UI = { pl: MESSAGES.pl.ui, ru: MESSAGES.ru.ui, en: MESSAGES.en.ui };
export function photoCount(locale: Locale, count: number): string {
  const forms = {
    pl: { one: 'zdjęcie realizacji', few: 'zdjęcia realizacji', other: 'zdjęć realizacji' },
    ru: { one: 'фотография работ', few: 'фотографии работ', other: 'фотографий работ' },
    en: { one: 'photograph of our work', few: 'photographs of our work', other: 'photographs of our work' },
  };
  const plural = new Intl.PluralRules(locale).select(count);
  return count + ' ' + forms[locale][plural === 'one' ? 'one' : plural === 'few' ? 'few' : 'other'];
}
