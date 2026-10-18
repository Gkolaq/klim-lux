import {
  ANALYTICS_CONSENT_DAYS, ANALYTICS_CONSENT_KEY, ANALYTICS_HOST,
  analyticsLocation, consentDecision, measurementId,
} from '../config/analytics';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
} & Record<string, unknown>;

/** Basic consent: no Google script or collection requests before an opt-in. */
export function installAnalytics(doc: Document, win: AnalyticsWindow): void {
  const panel = doc.querySelector<HTMLElement>('#analytics-consent');
  const id = measurementId(panel?.dataset.measurementId);
  if (!panel || !id || win.location.hostname !== ANALYTICS_HOST || panel.dataset.initialized) return;
  panel.dataset.initialized = 'true';
  const close = panel.querySelector<HTMLButtonElement>('[data-analytics-close]');
  let choice: 'granted' | 'denied' | null = null;
  let started = false;
  let pageViewed = false;
  const disableKey = 'ga-disable-' + id;
  const readChoice = () => {
    try { return consentDecision(win.localStorage.getItem(ANALYTICS_CONSENT_KEY)); }
    catch { return null; }
  };
  const removeCookies = () => {
    // Preserve locale/session cookies and only remove this site's GA cookies.
    for (const part of doc.cookie.split(';')) {
      const name = part.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; domain=www.klim-lux.com', '; domain=.www.klim-lux.com', '; domain=klim-lux.com', '; domain=.klim-lux.com']) {
        doc.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax; Secure' + domain;
      }
    }
  };
  const show = () => {
    panel.hidden = false;
    if (close) close.hidden = choice === null;
  };
  const hide = () => { panel.hidden = true; };
  const event = (name: 'page_view' | 'click_phone' | 'click_email' | 'email_draft_prepared' | 'generate_lead') => {
    if (choice !== 'granted' || !started || win[disableKey]) return;
    win.gtag?.('event', name, {
      send_to: id,
      page_location: analyticsLocation(win.location.href),
      page_path: win.location.pathname,
      language: doc.documentElement.lang,
    });
  };
  const start = () => {
    win[disableKey] = false;
    if (started) return;
    started = true;
    win.dataLayer = win.dataLayer || [];
    // Google's documented queue uses arguments objects, rather than arrays.
    win.gtag = function () { win.dataLayer?.push(arguments); };
    win.gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    win.gtag('consent', 'update', { analytics_storage: 'granted' });
    win.gtag('js', new Date());
    let referrer = '';
    try {
      const url = new URL(doc.referrer);
      // Keep only the referring origin: external paths can contain private data.
      if (url.protocol === 'https:' || url.protocol === 'http:') referrer = url.origin + '/';
    } catch { /* Direct visit. */ }
    win.gtag('config', id, {
      send_page_view: false,
      page_location: analyticsLocation(win.location.href),
      page_referrer: referrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: ANALYTICS_HOST,
      cookie_expires: ANALYTICS_CONSENT_DAYS * 86400,
      cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure',
    });
    const script = doc.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    script.referrerPolicy = 'no-referrer';
    doc.head.append(script);
    if (!pageViewed) { pageViewed = true; event('page_view'); }
  };
  const apply = (next: 'granted' | 'denied' | null) => {
    choice = next;
    if (choice === 'granted') start();
    else {
      win[disableKey] = true;
      removeCookies();
      // Drop queued events if consent is revoked before the Google script loads.
      if (win.dataLayer) win.dataLayer.length = 0;
    }
  };
  panel.querySelectorAll<HTMLButtonElement>('[data-analytics-choice]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.analyticsChoice;
      if (next !== 'granted' && next !== 'denied') return;
      const previouslyStarted = started;
      apply(next);
      try { win.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ v: 1, choice: next, at: Date.now() })); }
      catch { /* The selection still applies to this page if storage is blocked. */ }
      hide();
      // Reload after withdrawal to unload Google's runtime and its timers fully.
      if (next === 'denied' && previouslyStarted) win.location.reload();
    });
  });
  close?.addEventListener('click', hide);
  doc.querySelectorAll<HTMLButtonElement>('[data-analytics-settings]').forEach(button => button.addEventListener('click', () => {
    show(); panel.querySelector<HTMLButtonElement>('[data-analytics-choice]')?.focus();
  }));
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && choice !== null) hide(); });
  doc.addEventListener('click', e => {
    const target = e.target as Element | null;
    const anchor = target?.closest?.('a[href]');
    const href = anchor?.getAttribute('href') ?? '';
    if (/^tel:/i.test(href)) event('click_phone');
    else if (/^mailto:/i.test(href)) event('click_email');
  }, { capture: true });
  doc.addEventListener('klim:email-draft-prepared', () => event('email_draft_prepared'));
  // Only an acknowledged server submission counts; drafts and failures do not.
  doc.addEventListener('klim:contact-accepted', () => event('generate_lead'));
  win.addEventListener('storage', e => {
    if (e.key !== ANALYTICS_CONSENT_KEY) return;
    const previouslyStarted = started;
    apply(readChoice());
    if (choice === null) show(); else hide();
    if (choice !== 'granted' && previouslyStarted) win.location.reload();
  });
  apply(readChoice());
  if (choice === null) show(); else hide();
}

if (typeof document !== 'undefined') installAnalytics(document, window as unknown as AnalyticsWindow);
