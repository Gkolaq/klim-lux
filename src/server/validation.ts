import { z } from 'zod';
import { normalizeContent } from '../data/content';
import { migrateLocaleFields } from '../data/localization-migration';
import {LIBRARY_CATEGORIES,LIBRARY_RIGHTS} from '../data/library';

const copy = (max: number, min = 0) => z.string().trim().min(min).max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s));
const libraryId=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const httpsUrl=z.string().max(1200).refine(value=>{if(!value)return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}},'Укажите полный адрес https:// без логина и пароля.');
const libraryEntry=z.object({
  id:libraryId,title:copy(240,1),author:copy(240,1),publisher:copy(240),year:copy(40),language:z.enum(['pl','ru','en','be','uk']),kind:z.enum(['book','learning','reference']),category:z.enum(LIBRARY_CATEGORIES),
  descriptions:z.object({pl:copy(4000),ru:copy(4000),en:copy(4000)}).strict(),
  sourceUrl:httpsUrl,externalDownloadUrl:httpsUrl,fileId:z.union([z.literal(''),z.uuid()]),rights:z.enum(LIBRARY_RIGHTS),rightsNote:copy(1500),translationOf:z.union([z.literal(''),libraryId]),translator:copy(240),visible:z.boolean(),order:z.number().int().min(0).max(100000),
}).strict().superRefine((item,ctx)=>{
  if(item.fileId&&(item.rights==='source-only'||!item.rightsNote))ctx.addIssue({code:'custom',path:['rightsNote'],message:'Для файла на сайте укажите право на распространение и основание, включая перевод.'});
  if(item.visible&&!item.fileId&&!item.sourceUrl&&!item.externalDownloadUrl)ctx.addIssue({code:'custom',path:['sourceUrl'],message:'У опубликованного материала должен быть источник или PDF.'});
  if(item.visible&&!Object.values(item.descriptions).some(text=>text.length>=20))ctx.addIssue({code:'custom',path:['descriptions'],message:'Добавьте описание материала, минимум 20 символов.'});
});
const page = z.object({ slug: copy(30,1), title: copy(140,1), lead: copy(700,1), body: copy(8000), seoTitle: copy(180,1), seoDescription: copy(500,1) }).strict();
const category = z.enum(['upholstery','covers','custom','mechanisms']);
const id = z.string().regex(/^(?:\d{1,6}|[a-f0-9-]{36})$/);
const image = z.string().regex(/^\/(?:images\/(?:originals|responsive)\/[\w-]+\.(?:jpg|jpeg|png|webp)|media\/[a-f0-9-]{36}\/(?:full|thumb)\/?)$/i);
const pages = z.array(page).length(5).refine(p => ['services','materials','workshop','portfolio','contacts'].every(s => p.filter(x=>x.slug===s).length===1));
const serviceSlugs = (p: {slug:string}[]) => ['upholstery','restoration','covers','details'].every(s=>p.filter(x=>x.slug===s).length===1);
const materials = z.array(z.object({name:copy(100,1),text:copy(1500,1)}).strict()).min(1).max(30);
const process = z.array(z.object({title:copy(100,1),text:copy(1500,1)}).strict()).min(1).max(8);
const translation = z.object({
  business:z.object({owner:copy(100,1),city:copy(100,1),hours:copy(300)}).strict(),
  home:z.object({title:copy(160,1),lead:copy(700,1),note:copy(700),seoTitle:copy(180,1),seoDescription:copy(500,1)}).strict(),
  pages,services:z.array(page.extend({detail:copy(8000),preparation:copy(8000).optional()})).length(4).refine(serviceSlugs),materials,process,
  works:z.record(id,z.object({title:copy(160,1),description:copy(5000)}).strict()).refine(w=>Object.keys(w).length<=2000),
}).strict();
const currentContentSchema = z.object({
  version: z.literal(1),
  seoUpdatedAt:z.record(z.string().max(500).regex(/^https:\/\/www\.klim-lux\.com\/(?:pl|ru|en)\//),z.iso.datetime()).optional(),
  library:z.array(libraryEntry).max(250).optional(),
  business: z.object({ name: copy(70,1), email: z.email().max(150), phone: z.string().regex(/^\+?[\d\s()-]{7,30}$/), owner: copy(100,1), city: copy(100,1), hours: copy(300) }).strict(),
  home: z.object({ title: copy(160,1), lead: copy(700,1), note: copy(700), seoTitle: copy(180,1), seoDescription: copy(500,1), heroId: id }).strict(),
  pages: z.array(page).length(5).refine(p => ['services','materials','workshop','portfolio','contacts'].every(s => p.filter(x=>x.slug===s).length===1)),
  services: z.array(page.extend({ category, detail: copy(8000), preparation:copy(8000).optional() })).length(4).refine(p => ['upholstery','restoration','covers','details'].every(s => p.filter(x=>x.slug===s).length===1)),
  materials: z.array(z.object({ name: copy(100,1), text: copy(1500,1) }).strict()).min(1).max(30),
  process: z.array(z.object({ title: copy(100,1), text: copy(1500,1) }).strict()).min(1).max(8),
  works: z.array(z.object({ id, title: copy(160,1), description: copy(5000), date: copy(80), category, image, thumbnail: image, width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000), source: z.string().max(500).refine(s => !s || /^https:\/\/meb\.ucoz\.ru\/photo\/[\w/-]+$/.test(s)), visible: z.boolean(), featured: z.boolean(), order: z.number().int().min(0).max(100000) }).strict()).min(1).max(2000),
  translations:z.object({pl:translation,en:translation.optional()}).strict().optional(),
}).strict().superRefine((data, ctx) => {
  const books=data.library??[];
  if(new Set(books.map(item=>item.id)).size!==books.length)ctx.addIssue({code:'custom',path:['library'],message:'У материалов должны быть разные идентификаторы.'});
  const byId=new Map(books.map(item=>[item.id,item]));
  for(const book of books){
    if(book.translationOf&&!byId.has(book.translationOf))ctx.addIssue({code:'custom',path:['library'],message:'Оригинал перевода отсутствует в библиотеке.'});
    const seen=new Set([book.id]);let parent=book.translationOf;
    while(parent&&byId.has(parent)){if(seen.has(parent)){ctx.addIssue({code:'custom',path:['library'],message:'Связи переводов не должны образовывать цикл.'});break;}seen.add(parent);parent=byId.get(parent)!.translationOf;}
  }
  if (new Set(data.works.map(w=>w.id)).size !== data.works.length) ctx.addIssue({ code:'custom',message:'У работ должны быть разные номера.',path:['works'] });
  if (!data.works.some(w=>w.id===data.home.heroId && w.visible)) ctx.addIssue({ code:'custom',message:'Главная фотография должна быть видимой работой.',path:['home','heroId'] });
}).transform(normalizeContent);
export const contentSchema = z.preprocess(migrateLocaleFields,currentContentSchema);
export const saveSchema = z.object({ revision: z.number().int().nonnegative(), content: contentSchema }).strict();
