import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
export const GET: APIRoute = async ({params,request}) => {
  if (!/^[a-f0-9-]{36}$/.test(params.id||'') || !['full','thumb'].includes(params.variant||'')) return new Response('Не найдено',{status:404});
  try {
    const row=await env.DB.prepare('SELECT image_key, thumbnail_key FROM media_uploads WHERE id = ?').bind(params.id).first<{image_key:string;thumbnail_key:string}>();
    if(!row) return new Response('Не найдено',{status:404});
    const object = await env.BUCKET.get(params.variant==='full'?row.image_key:row.thumbnail_key);
    if(!object) return new Response('Не найдено',{status:404});
    const headers={ 'Content-Type':'image/webp','ETag':object.httpEtag,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff' };
    if(request.headers.get('if-none-match')===object.httpEtag) return new Response(null,{status:304,headers});
    return new Response(object.body,{headers});
  }catch(error){ console.error('Image unavailable',error instanceof Error?error.message:'unknown'); return new Response('Фотография временно недоступна',{status:503,headers:{'Retry-After':'120'}}); }
};
