const button=document.querySelector<HTMLButtonElement>('.menu-toggle');
const menu=document.getElementById('mobile-nav');
if(button&&menu){
 const close=(restore=false)=>{menu.hidden=true;button.setAttribute('aria-expanded','false');if(restore)button.focus({preventScroll:true});};
 button.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){close(true);}});
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&event.target instanceof Node&&!menu.contains(event.target)&&!button.contains(event.target))close();});
 menu.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('a'))close();});
 let viewportWidth=window.innerWidth;
 window.addEventListener('resize',()=>{
  if(window.innerWidth===viewportWidth)return;
  viewportWidth=window.innerWidth;
  close();
 });
}
