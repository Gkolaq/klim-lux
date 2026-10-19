import type {Content,Work} from '../data/content';
import {CATEGORIES} from '../data/categories';
import {contentSchema} from '../server/validation';
import {LANGUAGE_NAMES,LOCALES,type Locale,type TranslatedLocale} from '../i18n/locales';
import {UI} from '../i18n/ui';
import {initializeLibraryEditor} from './library-admin';

const app=document.getElementById('editor-app');
if(app) {
  let data:Content,revision=0,dirty=false,busy=false,workLimit=24,editSequence=0;
  let locale:Locale='ru';
  const language=document.getElementById('editor-language') as HTMLSelectElement;
  const copy=()=>locale==='ru'?data:data.translations[locale];
  const caption=(work:Work)=>locale==='ru'?work:data.translations[locale].works[work.id];
  const localizedPath=(path:string)=>locale==='ru'||['business.name','business.email','business.phone'].includes(path)?path:`translations.${locale}.${path}`;
  const status=document.getElementById('editor-status')!;
  const saveButton=document.getElementById('save-content') as HTMLButtonElement;
  const fields=document.getElementById('editor-fields') as HTMLFieldSetElement;
  const dialog=document.getElementById('work-dialog') as HTMLDialogElement;
  const workForm=document.getElementById('work-edit-form') as HTMLFormElement;
  const report=(message:string,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
  const setBusy=(value:boolean)=>{busy=value;fields.disabled=value;language.disabled=value||!data;saveButton.disabled=value||!dirty;};
  const changed=()=>{dirty=true;editSequence++;saveButton.disabled=busy;report('Есть несохранённые изменения.');};
  const request=async(path:string,options:RequestInit={})=>{const response=await fetch(path,{...options,credentials:'same-origin'});let result;try{result=await response.json();}catch{throw new Error('Сервер не ответил. Изменения остаются в панели.');}if(!response.ok)throw new Error(result.error||'Не удалось выполнить действие.');return result;};
  const libraryEditor=initializeLibraryEditor({getData:()=>data,getLocale:()=>locale,changed,busy:()=>busy,setBusy,report,request});
  const valueAt=(path:string)=>path.split('.').reduce((obj:any,key)=>obj[key],data);
  const writeAt=(path:string,value:string)=>{const keys=path.split('.'),last=keys.pop()!;const target=keys.reduce((obj:any,key)=>obj[key],data);target[last]=value;changed();};
  const field=(parent:HTMLElement,path:string,labelText:string,max:number,multiline=false)=>{
    path=localizedPath(path);
    const label=document.createElement('label');label.textContent=labelText;
    const input=multiline?document.createElement('textarea'):document.createElement('input');
    input.value=valueAt(path);input.maxLength=max;input.dataset.path=path;
    if(input instanceof HTMLTextAreaElement)input.rows=max>2000?5:3;
    input.addEventListener('input',()=>writeAt(path,input.value));label.append(input);parent.append(label);
  };
  const group=(parent:HTMLElement,title:string)=>{const details=document.createElement('details');details.className='editor-group';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);const inside=document.createElement('div');inside.className='group-fields';details.append(inside);parent.append(details);return inside;};
  const populate=()=>{
    const localized=copy();
    for(const id of ['general-fields','pages-fields','services-fields','materials-fields','process-fields'])document.getElementById(id)!.replaceChildren();
    const general=document.getElementById('general-fields')!;
    const business=group(general,'Контакты мастерской');
    for(const [key,label,max] of [['name','Название в поиске',70],['owner','Имя мастера',100],['city','Город',100],['phone','Телефон',30],['email','Email',150],['hours','Встречи и время связи',300]] as const)field(business,'business.'+key,label,max);
    business.parentElement!.setAttribute('open','');
    const home=group(general,'Главная страница');
    for(const [key,label,max] of [['title','Заголовок',160],['lead','Вступление',700],['note','Короткая подпись',700],['seoTitle','Заголовок в поиске',180],['seoDescription','Описание в поиске',500]] as const)field(home,'home.'+key,label,max,key==='title'||key==='lead'||key==='note'||key==='seoDescription');
    home.parentElement!.setAttribute('open','');
    const pageLabels=[['title','Заголовок',140],['lead','Вступление',700],['body','Основной текст',8000],['seoTitle','Заголовок в поиске',180],['seoDescription','Описание в поиске',500]] as const;
    for(const collection of ['pages','services'] as const)localized[collection].forEach((page,i)=>{const inside=group(document.getElementById(collection+'-fields')!,page.title);for(const [key,label,max] of pageLabels)field(inside,`${collection}.${i}.${key}`,label,max,key==='lead'||key==='body'||key==='seoDescription');if(collection==='services'){field(inside,`services.${i}.detail`,'Что важно учесть',8000,true);field(inside,`services.${i}.preparation`,'Что подготовить перед обращением',8000,true);}});
    localized.materials.forEach((material,i)=>{const inside=group(document.getElementById('materials-fields')!,material.name);field(inside,`materials.${i}.name`,'Название',100);field(inside,`materials.${i}.text`,'Описание',1500,true);});
    localized.process.forEach((step,i)=>{const inside=group(document.getElementById('process-fields')!,step.title);field(inside,`process.${i}.title`,'Название этапа',100);field(inside,`process.${i}.text`,'Описание',1500,true);});
    renderWorks();libraryEditor.render();
  };
  language.addEventListener('change',()=>{locale=language.value as Locale;workLimit=24;populate();document.getElementById('editor-language-note')!.textContent=`Редактируется ${LANGUAGE_NAMES[locale]}. Телефон, email, фотографии, даты и видимость общие для всех языков. Несохранённые изменения других языков остаются в панели.`;});
  const load=async()=>{
    if(dirty&&!confirm('Загрузить сохранённую версию? Несохранённые изменения в панели будут заменены. Перед этим можно скачать текущую копию.'))return;
    setBusy(true);document.getElementById('retry-content')!.hidden=true;
    try{const result=await request('/api/content/');data=result.content;revision=result.revision;dirty=false;populate();document.getElementById('editor-loading')!.hidden=true;document.getElementById('editor-layout')!.hidden=false;report(`Версия ${revision}. Все изменения сохранены.`);}
    catch(error){report((error as Error).message,true);document.getElementById('editor-loading')!.hidden=true;document.getElementById('retry-content')!.hidden=false;}
    finally{setBusy(false);}
  };
  const renderWorks=()=>{
    const q=(document.getElementById('work-search') as HTMLInputElement).value.trim().toLocaleLowerCase(locale);
    const category=(document.getElementById('work-category') as HTMLSelectElement).value;
    const all=data.works.filter(w=>(!category||w.category===category)&&(!q||(caption(w).title+' '+w.id).toLocaleLowerCase(locale).includes(q))).sort((a,b)=>a.order-b.order);
    const grid=document.getElementById('editor-work-grid')!;grid.replaceChildren();
    document.getElementById('editor-work-count')!.textContent=`Показано ${Math.min(workLimit,all.length)} из ${all.length}`;
    document.getElementById('more-admin-works')!.hidden=all.length<=workLimit;
    all.slice(0,workLimit).forEach(work=>{const button=document.createElement('button');button.type='button';button.className='editor-work-card';const image=document.createElement('img');image.src=work.thumbnail;image.alt='';image.loading='lazy';const title=document.createElement('strong');title.textContent=caption(work).title;const note=document.createElement('span');note.textContent=`№ ${work.id} · ${CATEGORIES[work.category]}${work.visible?'':' · Скрыта'}${data.home.heroId===work.id?' · Главное фото':''}`;button.append(image,title,note);button.addEventListener('click',()=>editWork(work));grid.append(button);});
  };
  const editWork=(work:Work)=>{
    for(const name of ['id','date','category','order'] as const)(workForm.elements.namedItem(name) as HTMLInputElement).value=String(work[name]);
    for(const name of ['title','description'] as const)(workForm.elements.namedItem(name) as HTMLInputElement).value=caption(work)[name];
    document.getElementById('work-edit-language')!.textContent='Подпись на языке: '+LANGUAGE_NAMES[locale];
    for(const name of ['visible','featured'] as const)(workForm.elements.namedItem(name) as HTMLInputElement).checked=work[name];
    (workForm.elements.namedItem('hero') as HTMLInputElement).checked=data.home.heroId===work.id;
    (document.getElementById('work-edit-image') as HTMLImageElement).src=work.thumbnail;
    document.getElementById('work-edit-status')!.textContent='';dialog.showModal();
  };
  saveButton.addEventListener('click',async()=>{
    if(!dirty||busy)return;
    const parsed=contentSchema.safeParse(data);
    if(!parsed.success){report('Проверьте поля: '+parsed.error.issues.slice(0,3).map(i=>i.path.join('.')+' — '+i.message).join('; '),true);return;}
    const sequence=editSequence;setBusy(true);report('Сохраняю и публикую изменения…');
    try{const result=await request('/api/content/',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,content:parsed.data})});revision=result.revision;if(sequence===editSequence){data=result.content;dirty=false;report(`Версия ${revision} опубликована. Изменения доступны на сайте.`);}else report(`Версия ${revision} опубликована. Новые изменения ещё не сохранены.`);}
    catch(error){report((error as Error).message,true);}
    finally{setBusy(false);}
  });
  document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==button.dataset.section;if(!panel.hidden)panel.querySelector<HTMLElement>('h2')?.focus();});
  }));
  workForm.addEventListener('submit',event=>{
    event.preventDefault();if(!workForm.reportValidity())return;
    const values=new FormData(workForm),work=data.works.find(w=>w.id===values.get('id'))!;
    const visible=values.has('visible'),hero=values.has('hero');
    if(!String(values.get('title')).trim()){document.getElementById('work-edit-status')!.textContent='Добавьте название работы.';return;}
    if((data.home.heroId===work.id||hero)&&!visible){document.getElementById('work-edit-status')!.textContent='Главная фотография должна быть видимой. Сначала выберите другую главную фотографию.';return;}
    Object.assign(caption(work),{title:String(values.get('title')).trim(),description:String(values.get('description')).trim()});
    Object.assign(work,{date:String(values.get('date')).trim(),category:values.get('category'),order:Number(values.get('order')),visible,featured:values.has('featured')});
    if(hero)data.home.heroId=work.id;
    changed();renderWorks();dialog.close();
  });
  document.getElementById('close-work-dialog')!.addEventListener('click',()=>dialog.close());
  for(const id of ['work-search','work-category'])document.getElementById(id)!.addEventListener('input',()=>{workLimit=24;renderWorks();});
  document.getElementById('more-admin-works')!.addEventListener('click',()=>{workLimit+=24;renderWorks();});
  const download=()=>{if(!data)return;const blob=new Blob([JSON.stringify({format:'klim-lux-content-v1',revision,exportedAt:new Date().toISOString(),content:data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='klim-lux-content-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  document.getElementById('export-content')!.addEventListener('click',download);
  const replaceContent=(incoming:unknown)=>{const parsed=contentSchema.safeParse(incoming);if(!parsed.success)throw new Error('Копия имеет неподходящий формат. Текущие данные не изменены.');if(dirty&&!confirm('Заменить несохранённые изменения загруженной копией?'))return;data=parsed.data;changed();populate();report('Копия загружена в панель. Проверьте её и сохраните, чтобы опубликовать.');};
  document.getElementById('import-content')!.addEventListener('change',async event=>{const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>900000)throw new Error('JSON-копия слишком большая.');const backup=JSON.parse(await file.text());replaceContent(backup.content??backup);}catch(error){report((error as Error).message,true);}finally{input.value='';}});
  document.getElementById('load-history')!.addEventListener('click',async()=>{
    setBusy(true);try{const history=await request('/api/history/');const list=document.getElementById('history-list')!;list.replaceChildren();if(!history.length)list.textContent='После первого сохранения здесь появятся версии.';history.forEach((entry:{revision:number;created_at:string})=>{const button=document.createElement('button');button.type='button';button.className='history-entry';button.textContent=`Версия ${entry.revision} · ${new Date(entry.created_at).toLocaleString('ru-RU')} · Загрузить в панель`;button.addEventListener('click',async()=>{setBusy(true);try{const snapshot=await request('/api/history/?revision='+entry.revision);replaceContent(snapshot.content);}catch(error){report((error as Error).message,true);}finally{setBusy(false);}});list.append(button);});}
    catch(error){report((error as Error).message,true);}finally{setBusy(false);}
  });
  const resize=async(bitmap:ImageBitmap,max:number)=>{const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Браузер не смог подготовить фотографию.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',0.88));if(!blob||blob.type!=='image/webp')throw new Error('Для загрузки фотографии нужен браузер с поддержкой WebP.');return {blob,width:canvas.width,height:canvas.height};};
  document.getElementById('upload-photo')!.addEventListener('change',async event=>{
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file||busy)return;setBusy(true);report('Подготавливаю и загружаю фотографию…');let bitmap:ImageBitmap|undefined;
    try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8000000)throw new Error('Выберите JPG, PNG или WebP размером до 8 МБ.');bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000)throw new Error('Фотография слишком большая. Уменьшите её до 40 мегапикселей.');const full=await resize(bitmap,1600),thumb=await resize(bitmap,720),form=new FormData();form.append('image',full.blob,'photo.webp');form.append('thumbnail',thumb.blob,'thumb.webp');form.append('width',String(full.width));form.append('height',String(full.height));const photo=await request('/api/upload/',{method:'POST',body:form});const work:Work={...photo,title:file.name.replace(/\.[^.]+$/,'').slice(0,160)||'Новая работа',description:'',date:'',category:'upholstery',source:'',visible:true,featured:false,order:0};data.works.unshift(work);for(const l of LOCALES.filter(l=>l!=='ru') as TranslatedLocale[])data.translations[l].works[work.id]={title:UI[l].workNumber+work.id,description:''};changed();renderWorks();editWork(work);report('Фотография загружена. Заполните подписи на трёх языках через переключатель и сохраните изменения.');}
    catch(error){report((error as Error).message,true);}finally{bitmap?.close();input.value='';setBusy(false);}
  });
  document.getElementById('retry-content')!.addEventListener('click',()=>void load());
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  void load();
}
