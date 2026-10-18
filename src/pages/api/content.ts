import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { DEFAULT_CONTENT } from '../../data/content';
import { editor, sameOrigin, limitedBody, json, errorResponse, HttpError } from '../../server/auth';
import { saveSchema } from '../../server/validation';
import { readContent, saveContent } from '../../server/content-store';
import { notifySavedContent } from '../../server/indexnow';

export const GET: APIRoute = async ({request}) => {
  try { editor(request,env.EDITOR_EMAILS); return json(await readContent(env.DB,DEFAULT_CONTENT)); }
  catch (error) { return errorResponse(error); }
};
export const PUT: APIRoute = async ({request,locals}) => {
  try {
    const user = editor(request,env.EDITOR_EMAILS); sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'Ожидаются данные JSON.');
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder().decode(await limitedBody(request,900000))); }
    catch(error) { if(error instanceof HttpError) throw error; throw new HttpError(400,'Не удалось прочитать изменения.'); }
    const parsed = saveSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(422, 'Проверьте поля: ' + parsed.error.issues.slice(0,3).map(x=>x.path.join('.') + ' — ' + x.message).join('; '));
    const ids = new Set(parsed.data.content.works.map(w=>w.id));
    if(DEFAULT_CONTENT.works.some(w=>!ids.has(w.id))) throw new HttpError(422,'Исходный архив нужно сохранить целиком. Ненужные работы можно скрыть.');
    const knownImages = new Set(DEFAULT_CONTENT.works.flatMap(w=>[w.image,w.thumbnail]));
    const uploads = (await env.DB.prepare('SELECT id FROM media_uploads').all<{id:string}>()).results;
    uploads.forEach(row=>{knownImages.add(`/media/${row.id}/full/`);knownImages.add(`/media/${row.id}/thumb/`);});
    if(parsed.data.content.works.some(w=>!knownImages.has(w.image)||!knownImages.has(w.thumbnail))) throw new HttpError(422,'В копии есть недоступная фотография. Загрузите её через панель.');
    const files=new Set((await env.DB.prepare('SELECT id FROM library_uploads').all<{id:string}>()).results.map(file=>file.id));
    if(parsed.data.content.library.some(item=>item.fileId&&!files.has(item.fileId)))throw new HttpError(422,'PDF из копии отсутствует в хранилище. Загрузите его через библиотеку.');
    const previous = await readContent(env.DB,DEFAULT_CONTENT);
    const saved = await saveContent(env.DB,parsed.data.content,parsed.data.revision,user.id,previous.content);
    // Search notifications run only after the durable save and never turn a saved edit into an error.
    const notification = notifySavedContent(previous.content,saved.content).catch(() => {
      console.warn('IndexNow notification could not finish');
    });
    const context = (locals as App.Locals & {cfContext?:{waitUntil(promise:Promise<unknown>):void}}).cfContext;
    try {
      if (context) context.waitUntil(notification);
      else await notification;
    } catch { console.warn('IndexNow execution context unavailable'); }
    return json(saved);
  } catch(error) { return errorResponse(error); }
};
