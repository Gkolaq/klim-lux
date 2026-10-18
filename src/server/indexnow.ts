import type { Content } from '../data/content';
import { SITE_URL } from '../config/site';
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, INDEXNOW_KEY_URL } from '../config/indexnow';

type Fetcher = typeof globalThis.fetch;
export interface IndexNowResult {
  count: number; accepted: boolean; status: number | null; pendingKeyValidation: boolean; error?: string;
}
export { publicPageUrls, changedPageUrls } from '../seo/pages';
import { changedPageUrls } from '../seo/pages';

export async function submitIndexNow(urls: string[], fetcher: Fetcher = globalThis.fetch): Promise<IndexNowResult> {
  const safeUrls = [...new Set(urls)].filter(url => {
    try { const parsed = new URL(url); const pageOnly = [...parsed.searchParams.keys()].every(key => key === 'page') && (!parsed.search || (parsed.searchParams.getAll('page').length === 1 && /^[2-9]\d*$|^1\d+$/.test(parsed.searchParams.get('page') || ''))); return parsed.origin === SITE_URL && pageOnly && !parsed.hash; }
    catch { return false; }
  });
  if (!safeUrls.length) return { count: 0, accepted: true, status: null, pendingKeyValidation: false };
  if (safeUrls.length > 10000) return { count: safeUrls.length, accepted: false, status: null, pendingKeyValidation: false, error: 'batch_too_large' };
  const body = JSON.stringify({ host: new URL(SITE_URL).hostname, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_URL, urlList: safeUrls });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(INDEXNOW_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body, signal: AbortSignal.timeout(10000) });
      const status = response.status;
      const retryAfter = response.headers.get('Retry-After');
      await response.body?.cancel();
      if (status === 200 || status === 202) return { count: safeUrls.length, accepted: true, status, pendingKeyValidation: status === 202 };
      const retryable = status === 429 || status >= 500;
      const delaySeconds = retryAfter === null ? 1 : Number(retryAfter);
      if (attempt === 0 && retryable && Number.isFinite(delaySeconds) && delaySeconds >= 0 && delaySeconds <= 2) {
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        continue;
      }
      return { count: safeUrls.length, accepted: false, status, pendingKeyValidation: false, error: 'http_' + status };
    } catch {
      if (attempt === 0) continue;
      return { count: safeUrls.length, accepted: false, status: null, pendingKeyValidation: false, error: 'network_or_timeout' };
    }
  }
  return { count: safeUrls.length, accepted: false, status: null, pendingKeyValidation: false, error: 'not_sent' };
}

export async function notifySavedContent(before: Content, after: Content): Promise<void> {
  const urls = changedPageUrls(before, after);
  if (!urls.length) return;
  const result = await submitIndexNow(urls);
  if (!result.accepted) console.warn('IndexNow notification failed', result.error, result.count);
  else console.info('IndexNow notification accepted', result.status, result.count);
}

