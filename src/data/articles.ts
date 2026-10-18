import raw from './authored-articles.json';
import type { Locale } from '../i18n/locales';
import { localePath } from '../i18n/locales';

export interface AuthoredArticle {
  group: string; slug: string; language: Locale; title: string; lead: string; description: string;
  author: string; published: string; modified: string; sourceUrl: string; originalTitle: string;
  sections: { heading: string; paragraphs: string[] }[];
}
export const AUTHORED_ARTICLES = raw as AuthoredArticle[];
export const articleBasePath = (article: AuthoredArticle) => '/materials/' + article.slug + '/';
export const articlePath = (article: AuthoredArticle) => localePath(article.language, articleBasePath(article));
export const articlesForLocale = (locale: Locale) => AUTHORED_ARTICLES.filter(article => article.language === locale);
export const articleLanguagePaths = (article: AuthoredArticle): Partial<Record<Locale, string>> =>
  Object.fromEntries(AUTHORED_ARTICLES.filter(edition => edition.group === article.group).map(edition => [edition.language, articleBasePath(edition)]));
export const ARTICLE_UI = {
  pl: { heading: 'Teksty autora', summary: 'Pierwszy autorski tekst Olega Klimko: co klient może sprawdzić przy tapicerowaniu i jak rozpoznać nierzetelną pracę.', read: 'Przeczytaj artykuł', first: 'Pierwszy autorski tekst o meblach', origin: 'Pierwsza publikacja na meb.ucoz.ru. Wznowienie na Klim-Lux z niewielką redakcją stylistyczną; przekład z rosyjskiego.', source: 'Oryginalny tekst na meb.ucoz.ru', back: 'Materiały', contact: 'Omów tapicerowanie swoich mebli', service: 'Wymiana tapicerki w Warszawie' },
  ru: { heading: 'Авторские статьи', summary: 'Мой первый текст о мебели: что заказчик может проверить при перетяжке и как распознать недобросовестную работу.', read: 'Читать статью', first: 'Первый авторский текст о мебели', origin: 'Впервые опубликовано на meb.ucoz.ru. Переиздано на Klim-Lux с небольшой стилистической правкой.', source: 'Исходная публикация на meb.ucoz.ru', back: 'Материалы', contact: 'Обсудить перетяжку вашей мебели', service: 'Перетяжка мебели в Варшаве' },
  en: { heading: 'Articles by the author', summary: 'Oleg Klimko’s first furniture article: what customers can check during reupholstery and how to recognise dishonest work.', read: 'Read the article', first: 'My first article about furniture', origin: 'First published on meb.ucoz.ru. Republished on Klim-Lux with light stylistic editing; translated from Russian.', source: 'Original article on meb.ucoz.ru', back: 'Materials', contact: 'Discuss your furniture', service: 'Reupholstery in Warsaw' },
} as const;
