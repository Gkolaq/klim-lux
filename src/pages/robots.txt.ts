import type { APIRoute } from 'astro';
import { SITE_URL } from '../config/site';
export const GET: APIRoute = () => new Response(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /language/\nDisallow: /library-files/\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});
