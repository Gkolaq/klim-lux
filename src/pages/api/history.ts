import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { editor,json,errorResponse,HttpError } from '../../server/auth';
import {normalizeContent} from '../../data/content';
export const GET: APIRoute = async ({request,url}) => {
  try {
    editor(request,env.EDITOR_EMAILS);
    const revision = url.searchParams.get('revision');
    if (revision) {
      if(!/^\d{1,10}$/.test(revision)) throw new HttpError(400,'Неверный номер версии.');
      const row = await env.DB.prepare('SELECT payload FROM content_history WHERE revision = ?').bind(Number(revision)).first<{payload:string}>();
      if (!row) throw new HttpError(404,'Версия не найдена.');
      return json({ content:normalizeContent(JSON.parse(row.payload)) });
    }
    return json((await env.DB.prepare('SELECT revision, created_at FROM content_history ORDER BY revision DESC LIMIT 50').all()).results);
  }catch(error){ return errorResponse(error); }
};
