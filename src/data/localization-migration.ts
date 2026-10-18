import { DEFAULT_LIBRARY } from './library';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Upgrade old backups without accepting unrelated fields or replacing owner edits. */
export function migrateLocaleFields(value: unknown): unknown {
  if (!object(value)) return value;
  const result = { ...value };
  if (object(value.translations)) {
    const translations = { ...value.translations };
    delete translations.be;
    delete translations.uk;
    result.translations = translations;
  }
  if (Array.isArray(value.library)) result.library = value.library.map(item => {
    if (!object(item) || !object(item.descriptions)) return item;
    const descriptions = { ...item.descriptions };
    delete descriptions.be;
    delete descriptions.uk;
    if (descriptions.en === undefined) descriptions.en = DEFAULT_LIBRARY.find(book => book.id === item.id)?.descriptions.en ?? '';
    return { ...item, descriptions };
  });
  return result;
}
