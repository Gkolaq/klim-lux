export const PORTFOLIO_PAGE_SIZE = 18;
export const LIBRARY_PAGE_SIZE = 24;
export function pageWindow(total: number, pageSize: number, requested: string | null) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const number = Number(requested ?? 1);
  const current = Number.isFinite(number) ? Math.min(pages, Math.max(1, Math.floor(number))) : 1;
  return { pages, current, start: (current - 1) * pageSize, normalise: requested !== null && (current === 1 || requested !== String(current)) };
}
