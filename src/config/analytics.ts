export const ANALYTICS_HOST = 'www.klim-lux.com';
export const ANALYTICS_CONSENT_KEY = 'klim_analytics_consent_v1';
export const ANALYTICS_CONSENT_DAYS = 180;

export function measurementId(value: unknown): string | null {
  return typeof value === 'string' && /^G-[A-Z0-9]{4,20}$/.test(value) ? value : null;
}

export function publicAnalyticsId(value: unknown, host: string, excluded = false): string | null {
  return !excluded && host === ANALYTICS_HOST ? measurementId(value) : null;
}

/** Search terms, fragments and draft email text never enter analytics URLs. */
export function analyticsLocation(href: string): string {
  const url = new URL(href);
  return url.origin + url.pathname;
}

export function consentDecision(raw: string | null, now = Date.now()): 'granted' | 'denied' | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    const age = now - value?.at;
    return value?.v === 1 && ['granted', 'denied'].includes(value?.choice)
      && Number.isFinite(value?.at) && age >= 0 && age < ANALYTICS_CONSENT_DAYS * 86400000
      ? value.choice : null;
  } catch { return null; }
}

export function contentSecurityPolicy(analytics: boolean): string {
  const scripts = analytics ? ' https://www.googletagmanager.com' : '';
  const images = analytics ? ' https://www.googletagmanager.com https://*.google-analytics.com' : '';
  const collection = analytics ? ' https://www.googletagmanager.com https://*.google-analytics.com https://analytics.google.com https://www.google.com' : '';
  return "default-src 'self'; script-src 'self' 'unsafe-inline'" + scripts
    + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:" + images
    + "; font-src 'self'; connect-src 'self'" + collection
    + "; form-action 'self' mailto:; base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com";
}
