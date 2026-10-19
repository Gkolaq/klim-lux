import type { APIRoute } from 'astro';
import { isLocale, LANGUAGE_COOKIE, localePath } from '../../i18n/locales';

export const GET: APIRoute = ({url,cookies}) => {
  const selected=url.searchParams.get('locale');
  const locale=selected==='be'||selected==='uk'?'ru':selected, path=url.searchParams.get('path')||'/';
  const query=url.searchParams.get('query')||'';
  if(!isLocale(locale)||path.length>1000||query.length>2000||!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(path)) {
    return new Response('Invalid language selection',{status:400});
  }
  cookies.set(LANGUAGE_COOKIE,locale,{path:'/',httpOnly:true,secure:true,sameSite:'lax',maxAge:31536000});
  const params=new URLSearchParams(query);
  return new Response(null,{status:302,headers:{Location:localePath(locale,path)+(params.size?'?'+params.toString():''),'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
};
