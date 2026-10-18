export const CATEGORIES = { upholstery:'Перетяжка', covers:'Чехлы', custom:'Изготовление', mechanisms:'Механизмы' } as const;
export type Category = keyof typeof CATEGORIES;
