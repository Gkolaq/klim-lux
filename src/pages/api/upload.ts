import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { editor,sameOrigin,limitedBody,json,errorResponse,HttpError } from '../../server/auth';

export const POST: APIRoute = async ({request}) => {
  const keys: string[] = [];
  let uploaded = false;
  try {
    const user = editor(request,env.EDITOR_EMAILS); sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new HttpError(415,'Выберите фотографию.');
    const bytes = await limitedBody(request,8500000);
    let form: FormData;
    try {
      form = await new Response(bytes, {headers:{'Content-Type':request.headers.get('content-type')!}}).formData();
    } catch {
      throw new HttpError(400,'Не удалось прочитать фотографию. Выберите файл ещё раз.');
    }
    const file = form.get('image'), thumb = form.get('thumbnail');
    if (!(file instanceof File) || !(thumb instanceof File) || !file.size || !thumb.size || file.size>6000000 || thumb.size>2000000) throw new HttpError(422,'Фотография слишком большая или не читается.');
    const fullBytes = await file.arrayBuffer(), thumbBytes = await thumb.arrayBuffer();
    for(const buffer of [fullBytes,thumbBytes]) {
      const b = new Uint8Array(buffer);
      if (String.fromCharCode(...b.slice(0,4)) !== 'RIFF' || String.fromCharCode(...b.slice(8,12)) !== 'WEBP') throw new HttpError(422,'Загрузка поддерживает подготовленные WebP-фотографии.');
    }
    const width=Number(form.get('width')),height=Number(form.get('height'));
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1600||height>1600) throw new HttpError(422,'Не удалось определить размеры фотографии.');
    const id = crypto.randomUUID();
    keys.push(`uploads/${id}/full.webp`,`uploads/${id}/thumb.webp`);
    await env.BUCKET.put(keys[0],fullBytes,{httpMetadata:{contentType:'image/webp'}});
    await env.BUCKET.put(keys[1],thumbBytes,{httpMetadata:{contentType:'image/webp'}});
    await env.DB.prepare('INSERT INTO media_uploads (id, image_key, thumbnail_key, mime, width, height, bytes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id,keys[0],keys[1],'image/webp',width,height,file.size+thumb.size,new Date().toISOString(),user.id).run();
    uploaded=true;
    return json({id,image:`/media/${id}/full/`,thumbnail:`/media/${id}/thumb/`,width,height});
  }catch(error){
    if(keys.length && !uploaded) { try { await env.BUCKET.delete(keys); }catch{ /* no destructive retry */ } }
    return errorResponse(error);
  }
};
