import type { APIRoute } from 'astro';
export const GET: APIRoute = () => new Response(null, {
  status: 308, headers: { Location: '/brand/klim-logo-192.png', 'Cache-Control': 'public, max-age=86400' },
});
