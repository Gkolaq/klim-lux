import type {APIRoute} from 'astro';
import {env} from 'cloudflare:workers';
import {editor,sameOrigin,limitedBody,json,errorResponse,HttpError} from '../../server/auth';
const MAX_FILE=20*1024*1024;
export const POST:APIRoute=async({request})=>{
  let key:string|undefined,stored=false;
  try{
    const user=editor(request,env.EDITOR_EMAILS);sameOrigin(request);
    if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new HttpError(415,'Выберите PDF через панель библиотеки.');
    const bytes=await limitedBody(request,MAX_FILE+65536);
    let form:FormData;
    try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}catch{throw new HttpError(400,'Не удалось прочитать файл.');}
    const file=form.get('file'),rights=String(form.get('rights')||''),note=String(form.get('rightsNote')||'').trim();
    if(!(file instanceof File)||file.size<8||file.size>MAX_FILE)throw new HttpError(413,'Выберите PDF размером до 20 МБ.');
    if(!['original','permission','open-license','public-domain'].includes(rights)||!note||note.length>1500||form.get('confirmed')!=='yes')throw new HttpError(422,'Укажите основание для распространения файла и подтвердите права, в том числе на перевод.');
    const content=await file.arrayBuffer();
    const header=new TextDecoder().decode(content.slice(0,8)),tail=new TextDecoder().decode(content.slice(-1024));
    if((file.type&&file.type!=='application/pdf')||!/^%PDF-[12]\.\d/.test(header)||!tail.includes('%%EOF'))throw new HttpError(415,'Файл должен быть настоящим PDF.');
    const id=crypto.randomUUID(),fileName=(file.name.normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,200).replace(/\.pdf$/i,'')||'publication')+'.pdf';
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content)),byte=>byte.toString(16).padStart(2,'0')).join('');
    key='library/'+id+'/publication.pdf';
    await env.BUCKET.put(key,content,{httpMetadata:{contentType:'application/pdf'}});
    await env.DB.prepare('INSERT INTO library_uploads (id,file_key,file_name,mime,bytes,sha256,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(id,key,fileName,'application/pdf',file.size,sha256,new Date().toISOString(),user.id).run();
    stored=true;return json({id,fileName,bytes:file.size,sha256},201);
  }catch(error){if(key&&!stored)try{await env.BUCKET.delete([key]);}catch{console.warn('Unfinished library upload cleanup failed');}return errorResponse(error);}
};

export const GET:APIRoute=()=>new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{'Content-Type':'application/json','Allow':'POST','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
