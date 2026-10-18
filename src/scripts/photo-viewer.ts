const viewer=document.getElementById('photo-viewer') as HTMLDialogElement|null;
const trigger=document.getElementById('open-photo-viewer') as HTMLAnchorElement|null;
if(viewer&&trigger&&typeof viewer.showModal==='function'){
  const open=()=>{const image=viewer.querySelector<HTMLImageElement>('img[data-full-src]');if(image&&!image.src)image.src=image.dataset.fullSrc!;if(!viewer.open){viewer.showModal();document.documentElement.classList.add('viewer-open');}};
  trigger.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    if(viewer.open)return;
    open();
    if(location.hash!=='#viewer')history.pushState({...history.state,klimLuxPhotoViewer:true},'',location.pathname+location.search+'#viewer');
  });
  document.getElementById('close-photo-viewer')?.addEventListener('click',()=>viewer.close());
  viewer.addEventListener('close',()=>{
    document.documentElement.classList.remove('viewer-open');
    if(location.hash==='#viewer'){
      if(history.state?.klimLuxPhotoViewer===true)history.back();
      else history.replaceState(history.state,'',location.pathname+location.search);
    }
    trigger.focus({preventScroll:true});
  });
  window.addEventListener('hashchange',()=>{if(location.hash==='#viewer')open();else if(viewer.open)viewer.close();});
  if(location.hash==='#viewer')open();
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    if(event.target instanceof HTMLElement&&(event.target.matches('input,textarea,select')||event.target.isContentEditable))return;
    const direction=event.key==='ArrowRight'?'next':event.key==='ArrowLeft'?'previous':undefined;
    if(!direction)return;
    const root=viewer.open?viewer:document.querySelector('.photo-stage');
    const arrow=root?.querySelector<HTMLAnchorElement>('[data-direction="'+direction+'"]');if(arrow){event.preventDefault();arrow.click();}
  });
}
