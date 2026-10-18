import pl from './messages/pl.json';
import ru from './messages/ru.json';
import en from './messages/en.json';
import type { Locale } from './locales';

export type Messages = typeof ru;
export const MESSAGES: Record<Locale, Messages> = { pl, ru, en };

