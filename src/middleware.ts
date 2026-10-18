import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { DEFAULT_CONTENT, localizedContent } from './data/content';
import { readContent, readPublicContent } from './server/content-store';
import { isLocale, localePath, retiredLocalePath } from './i18n/locales';
import { INDEXNOW_KEY_PATH } from './config/indexnow';
import { contentSecurityPolicy, publicAnalyticsId } from './config/analytics';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const retired = retiredLocalePath(pathname);
  if(context.url.hostname==='klim-lux.com') {
    const target=pathname==='/'?'/pl/':retired??pathname;
    return context.redirect('https://www.klim-lux.com'+target+context.url.search,308);
  }
  if(retired)return context.redirect(retired+context.url.search,301);
  if(pathname==='/')return context.redirect('/pl/'+context.url.search,301);
  // Keep existing Russian links valid after introducing language directories.
  if (/^\/(?:services(?:\/(?:upholstery|restoration|covers|details))?|materials|workshop|contacts|portfolio(?:\/[\da-f-]+)?|library(?:\/[a-z0-9-]+)?)(?:\/)?$/.test(pathname)) {
    return context.redirect(localePath('ru',pathname.endsWith('/')?pathname:pathname+'/')+context.url.search,308);
  }
  if(pathname.startsWith('/api/')) {
    const methods:Record<string,string[]>={'/api/content':['GET','PUT'],'/api/history':['GET'],'/api/upload':['POST'],'/api/library-upload':['POST'],'/api/health':['GET'],'/api/contact':['POST']};
    const allowed=methods[pathname.replace(/\/+$/,'')];
    const method=context.request.method;
    if(!allowed||!(allowed.includes(method)||(method==='HEAD'&&allowed.includes('GET')))) {
      const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
      if(allowed)headers.Allow=allowed.join(', ');
      return new Response(JSON.stringify({error:allowed?'Method not allowed':'Not found'}),{status:allowed?405:404,headers});
    }
  }
  const prefix=pathname.split('/')[1];
  context.locals.locale=isLocale(prefix)?prefix:'ru';
  const isApi = pathname.startsWith('/api/') || pathname.startsWith('/media/') || pathname.startsWith('/library-files/');
  const independentEndpoint = pathname === '/robots.txt' || pathname === '/favicon.ico' || pathname === '/favicon.svg' || pathname === '/brand/klim-logo.svg' || pathname === '/language/' || pathname === INDEXNOW_KEY_PATH;
  if (!isApi && !independentEndpoint) {
    try { context.locals.snapshot = await (pathname.startsWith('/admin')?readContent:readPublicContent)(env.DB, DEFAULT_CONTENT); }
    catch (error) {
      console.error('Content is unavailable', error instanceof Error ? error.message : 'unknown error');
      context.locals.snapshot = { revision:0, content:DEFAULT_CONTENT, updatedAt:null };
      context.locals.storageError = true;
    }
    context.locals.content=localizedContent(context.locals.snapshot.content,context.locals.locale);
  }
  const response = await next();
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options','SAMEORIGIN');
  response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const analyticsAllowed=!!publicAnalyticsId(env.GA4_MEASUREMENT_ID,context.url.hostname,!isLocale(prefix)||response.status!==200||!!context.locals.storageError);
  response.headers.set('Content-Security-Policy',contentSecurityPolicy(analyticsAllowed));
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control','private, no-store');
    response.headers.set('X-Robots-Tag','noindex, nofollow');
  } else if (!pathname.startsWith('/media/')&&!pathname.startsWith('/library-files/')) response.headers.set('Cache-Control','no-cache');
  if(pathname.startsWith('/language/')) {
    response.headers.set('Cache-Control','private, no-store');
    response.headers.set('X-Robots-Tag','noindex, nofollow');
  }
  if(pathname.startsWith('/library-files/'))response.headers.set('X-Robots-Tag','noindex, nofollow');
  if (context.locals.storageError && !independentEndpoint) {
    response.headers.set('X-Robots-Tag','noindex');
    response.headers.set('Retry-After','120');
    return new Response(response.body,{status:503,headers:response.headers});
  }
  return response;
});
