import type {APIRoute} from 'astro';
import {env} from 'cloudflare:workers';
import {DEFAULT_CONTENT} from '../../data/content';
import {canHostLibraryFile} from '../../data/library';
import {readContent} from '../../server/content-store';
import {editor,HttpError,errorResponse} from '../../server/auth';
export const GET:APIRoute=async({params,request})=>{
  try{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(params.id||''))throw new HttpError(404,'Файл не найден.');
    const snapshot=await readContent(env.DB,DEFAULT_CONTENT);
    const published=snapshot.content.library.some(item=>item.visible&&item.fileId===params.id&&canHostLibraryFile(item));
    if(!published){try{editor(request,env.EDITOR_EMAILS);}catch{throw new HttpError(404,'Файл не найден.');}}
    const row=await env.DB.prepare('SELECT file_key,file_name FROM library_uploads WHERE id=?').bind(params.id!).first<{file_key:string;file_name:string}>();
    if(!row)throw new HttpError(404,'Файл не найден.');
    const object=await env.BUCKET.get(row.file_key);if(!object)throw new HttpError(404,'Файл не найден.');
    const filename=encodeURIComponent(row.file_name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename=\"publication.pdf\"; filename*=UTF-8''"+filename,'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Cache-Control':published?'no-store':'private, no-store'}});
  }catch(error){return errorResponse(error);}
};
