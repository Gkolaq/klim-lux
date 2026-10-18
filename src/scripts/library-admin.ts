import { PUBLICATION_LANGUAGE_NAMES } from '../data/library';
import type {Content} from '../data/content';
import type {LibraryEntry} from '../data/library';
import {LANGUAGE_NAMES,type Locale} from '../i18n/locales';
interface Options {getData:()=>Content;getLocale:()=>Locale;changed:()=>void;busy:()=>boolean;setBusy:(busy:boolean)=>void;report:(message:string,error?:boolean)=>void;request:(url:string,options?:RequestInit)=>Promise<any>;}
export function initializeLibraryEditor(options:Options){
  const dialog=document.getElementById('library-dialog') as HTMLDialogElement,form=document.getElementById('library-edit-form') as HTMLFormElement;
  const list=document.getElementById('library-editor-list')!,search=document.getElementById('library-admin-search') as HTMLInputElement;
  const status=document.getElementById('library-edit-status')!,fileStatus=document.getElementById('library-file-status')!;
  let draft:LibraryEntry|undefined;
  const input=(name:string)=>form.elements.namedItem(name) as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
  const checkbox=(name:string)=>input(name) as HTMLInputElement;
  const fileNote=()=>{fileStatus.textContent=draft?.fileId?'PDF загружен. Файл будет доступен после публикации видимой карточки.':'Файл на сайте не загружен. Можно оставить ссылку на официальный источник.';(document.getElementById('detach-library-pdf') as HTMLButtonElement).hidden=!draft?.fileId;};
  const render=()=>{
    const data=options.getData();if(!data)return;
    const q=search.value.trim().toLocaleLowerCase('ru');list.replaceChildren();
    const items=data.library.filter(book=>!q||(book.title+' '+book.author).toLocaleLowerCase('ru').includes(q)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
    if(!items.length){const p=document.createElement('p');p.textContent='Материалов нет. Добавьте книгу или измените поиск.';list.append(p);}
    for(const book of items){const button=document.createElement('button');button.type='button';button.className='library-editor-row';const title=document.createElement('strong');title.textContent=book.title;const note=document.createElement('span');note.textContent=book.author+' · '+PUBLICATION_LANGUAGE_NAMES[book.language]+' · '+(book.visible?'Опубликована':'Скрыта')+(book.fileId?' · PDF':'');button.append(title,note);button.addEventListener('click',()=>edit(book));list.append(button);}
  };
  const edit=(book?:LibraryEntry)=>{
    if(options.busy())return;
    draft=book?structuredClone(book):{id:crypto.randomUUID(),title:'',author:'Klim & Co',publisher:'',year:'',language:'pl',kind:'book',category:'techniques',descriptions:{pl:'',ru:'',en:''},sourceUrl:'',externalDownloadUrl:'',fileId:'',rights:'source-only',rightsNote:'',translationOf:'',translator:'',visible:false,order:0};
    const languageSelect=input('language') as HTMLSelectElement;
    for(const option of [...languageSelect.querySelectorAll('option[data-legacy]')])option.remove();
    if(![...languageSelect.options].some(option=>option.value===draft!.language)){
      const option=document.createElement('option');option.value=draft.language;option.textContent=PUBLICATION_LANGUAGE_NAMES[draft.language];option.dataset.legacy='true';languageSelect.append(option);
    }
    for(const name of ['id','title','author','publisher','year','language','kind','category','sourceUrl','externalDownloadUrl','rights','rightsNote','translator','order'] as const)input(name).value=String(draft[name]);
    const locale=options.getLocale();input('description').value=draft.descriptions[locale];checkbox('visible').checked=draft.visible;checkbox('confirmed').checked=false;
    document.getElementById('library-edit-language')!.textContent='Описание на языке: '+LANGUAGE_NAMES[locale]+'. Перевод книги добавляется отдельной карточкой.';
    const original=input('translationOf') as HTMLSelectElement;original.replaceChildren();const none=document.createElement('option');none.value='';none.textContent='Оригинал / самостоятельный материал';original.append(none);
    for(const item of options.getData().library.filter(item=>item.id!==draft!.id)){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.title+' — '+PUBLICATION_LANGUAGE_NAMES[item.language]+(item.year?' ('+item.year+')':'');original.append(opt);}original.value=draft.translationOf;
    status.textContent='';fileNote();dialog.showModal();
  };
  form.addEventListener('submit',event=>{
    event.preventDefault();if(options.busy()||!draft||!form.reportValidity())return;
    const text=(name:string)=>input(name).value.trim();
    if(draft.fileId&&(text('rights')==='source-only'||!text('rightsNote')||!checkbox('confirmed').checked)){status.textContent='Укажите основание и подтвердите право на распространение PDF и перевода.';return;}
    if(checkbox('visible').checked&&!draft.fileId&&!text('sourceUrl')&&!text('externalDownloadUrl')){status.textContent='Добавьте ссылку на источник или загрузите PDF.';return;}
    const description=text('description'),descriptions={...draft.descriptions,[options.getLocale()]:description};
    if(checkbox('visible').checked&&!Object.values(descriptions).some(value=>value.length>=20)){status.textContent='Добавьте описание, минимум 20 символов.';return;}
    Object.assign(draft,{title:text('title'),author:text('author'),publisher:text('publisher'),year:text('year'),language:text('language'),kind:text('kind'),category:text('category'),descriptions,sourceUrl:text('sourceUrl'),externalDownloadUrl:text('externalDownloadUrl'),rights:text('rights'),rightsNote:text('rightsNote'),translationOf:text('translationOf'),translator:text('translator'),order:Number(text('order')),visible:checkbox('visible').checked});
    const data=options.getData(),index=data.library.findIndex(book=>book.id===draft!.id);if(index>=0)data.library[index]=draft;else data.library.push(draft);
    draft=undefined;options.changed();render();dialog.close();
  });
  document.getElementById('new-library-entry')!.addEventListener('click',()=>edit());search.addEventListener('input',render);
  document.getElementById('close-library-dialog')!.addEventListener('click',()=>{if(!options.busy())dialog.close();});
  dialog.addEventListener('cancel',event=>{if(options.busy())event.preventDefault();});
  document.getElementById('detach-library-pdf')!.addEventListener('click',()=>{if(!options.busy()&&draft){draft.fileId='';fileNote();}});
  document.getElementById('upload-library-pdf')!.addEventListener('change',async event=>{
    const upload=event.target as HTMLInputElement,file=upload.files?.[0];if(!file||!draft||options.busy())return;
    const rights=input('rights').value,note=input('rightsNote').value.trim();
    if(rights==='source-only'||!note||!checkbox('confirmed').checked){status.textContent='Сначала выберите основание, заполните сведения о правах и поставьте отметку подтверждения.';upload.value='';return;}
    if((file.type&&file.type!=='application/pdf')||file.size>20*1024*1024){status.textContent='Выберите PDF размером до 20 МБ.';upload.value='';return;}
    options.setBusy(true);status.textContent='Загружаю PDF…';
    try{const payload=new FormData();payload.append('file',file);payload.append('rights',rights);payload.append('rightsNote',note);payload.append('confirmed','yes');const result=await options.request('/api/library-upload/',{method:'POST',body:payload});draft.fileId=result.id;fileNote();status.textContent=result.fileName+' загружен. Примените карточку и сохраните изменения в панели.';}
    catch(error){status.textContent=(error as Error).message;options.report((error as Error).message,true);}
    finally{upload.value='';options.setBusy(false);}
  });
  return {render};
}
