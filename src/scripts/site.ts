import { installContactForm } from './contact';

const menu = document.querySelector<HTMLButtonElement>('.menu-toggle');
const mobileNav = document.querySelector<HTMLElement>('#mobile-nav');
function closeMenu(returnFocus = false) {
  if (mobileNav) mobileNav.hidden = true;
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', 'Открыть меню');
  if (returnFocus) menu?.focus();
}
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  if (mobileNav) mobileNav.hidden = !open;
});
mobileNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
document.addEventListener('click', event => {
  if (!mobileNav?.hidden && event.target instanceof Node && !mobileNav?.contains(event.target) && !menu?.contains(event.target)) closeMenu();
});
window.matchMedia('(min-width: 761px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>('.work'));
const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter'));
const search = document.querySelector<HTMLInputElement>('#gallery-search');
const more = document.querySelector<HTMLButtonElement>('#load-more');
const result = document.querySelector<HTMLElement>('#gallery-result');
const empty = document.querySelector<HTMLElement>('#gallery-empty');
const normalize = (text: string) => text.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
let filter = 'all';
let limit = 12;
let matching = cards;
function updateGallery() {
  const query = normalize(search?.value || '');
  matching = cards.filter(card => (filter === 'all' || card.dataset.category === filter) && (!query || normalize(card.dataset.search || '').includes(query)));
  const visible = new Set(matching.slice(0, limit));
  cards.forEach(card => { card.hidden = !visible.has(card); });
  if (more) more.hidden = matching.length <= limit;
  if (empty) empty.hidden = matching.length > 0;
  if (result) result.textContent = 'Показано ' + Math.min(limit, matching.length) + ' из ' + matching.length;
}
filters.forEach(button => {
  button.disabled = false;
  button.addEventListener('click', () => {
    filter = button.dataset.filter || 'all';
    limit = 12;
    filters.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    updateGallery();
  });
});
if (search) search.disabled = false;
search?.addEventListener('input', () => { limit = 12; updateGallery(); });
if (more) more.disabled = false;
more?.addEventListener('click', () => {
  const firstNew = matching[limit];
  limit += 12;
  updateGallery();
  firstNew?.focus({ preventScroll: true });
  firstNew?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

const lightbox = document.querySelector<HTMLDialogElement>('#lightbox');
const photo = document.querySelector<HTMLImageElement>('#lightbox-image');
const imageWrap = document.querySelector<HTMLElement>('#lightbox-image-wrap');
const imageStatus = document.querySelector<HTMLElement>('#image-status');
const fileLink = document.querySelector<HTMLAnchorElement>('#lightbox-file');
const previous = document.querySelector<HTMLButtonElement>('#lightbox-prev');
const next = document.querySelector<HTMLButtonElement>('#lightbox-next');
let current = 0;
let lastCard: HTMLAnchorElement | null = null;
let touchStart: { x: number; y: number } | null = null;
function finishImage(success: boolean) {
  imageWrap?.setAttribute('aria-busy', 'false');
  if (photo) photo.style.opacity = success ? '1' : '0';
  if (imageStatus) {
    imageStatus.hidden = success;
    imageStatus.textContent = success ? '' : 'Не удалось загрузить фотографию. Попробуйте открыть её отдельно.';
  }
  if (fileLink) fileLink.hidden = success;
}
photo?.addEventListener('load', () => finishImage(true));
photo?.addEventListener('error', () => finishImage(false));
function showPhoto(index: number) {
  if (!matching.length) return;
  current = (index + matching.length) % matching.length;
  const card = matching[current];
  imageWrap?.setAttribute('aria-busy', 'true');
  if (imageStatus) { imageStatus.hidden = false; imageStatus.textContent = 'Загружаем фотографию…'; }
  if (fileLink) { fileLink.href = card.dataset.image || ''; fileLink.hidden = true; }
  if (photo) {
    photo.style.opacity = '0';
    photo.alt = card.dataset.title || '';
    photo.src = card.dataset.image || '';
    if (photo.complete && photo.naturalWidth > 0) finishImage(true);
  }
  const title = document.querySelector('#lightbox-title');
  const description = document.querySelector('#lightbox-description');
  const position = document.querySelector('#lightbox-position');
  const date = document.querySelector('#lightbox-date');
  const source = document.querySelector<HTMLAnchorElement>('#lightbox-source');
  if (title) title.textContent = card.dataset.title || '';
  if (description) description.textContent = card.dataset.description || '';
  if (position) position.textContent = (current + 1) + ' / ' + matching.length;
  if (date) date.textContent = card.dataset.date || 'Архив работ';
  if (source) { source.href = card.dataset.source || ''; source.hidden = !card.dataset.source; }
  if (previous) previous.disabled = matching.length < 2;
  if (next) next.disabled = matching.length < 2;
}
cards.forEach(card => {
  // A real image link remains usable if dialog support or JavaScript is absent.
  if (lightbox && typeof lightbox.showModal === 'function') {
    card.setAttribute('aria-haspopup', 'dialog');
    card.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      lastCard = card;
      showPhoto(matching.indexOf(card));
      lightbox.showModal();
      document.body.style.overflow = 'hidden';
    });
  }
  const thumbnail = card.querySelector<HTMLImageElement>('img');
  thumbnail?.addEventListener('error', () => {
    if (thumbnail.dataset.fallback) return;
    thumbnail.dataset.fallback = 'true';
    thumbnail.removeAttribute('srcset');
    thumbnail.src = card.href;
  });
});
document.querySelector('#lightbox-close')?.addEventListener('click', () => lightbox?.close());
previous?.addEventListener('click', () => showPhoto(current - 1));
next?.addEventListener('click', () => showPhoto(current + 1));
lightbox?.addEventListener('close', () => { document.body.style.overflow = ''; lastCard?.focus({ preventScroll: true }); });
lightbox?.addEventListener('click', event => {
  if (event.target !== lightbox) return;
  const rect = lightbox.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) lightbox.close();
});
imageWrap?.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch' && event.isPrimary) touchStart = { x: event.clientX, y: event.clientY };
});
imageWrap?.addEventListener('pointerup', event => {
  if (!touchStart || event.pointerType !== 'touch') return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) showPhoto(current + (dx < 0 ? 1 : -1));
});
imageWrap?.addEventListener('pointercancel', () => { touchStart = null; });
document.addEventListener('keydown', event => {
  if (!lightbox?.open) {
    if (event.key === 'Escape' && !mobileNav?.hidden) closeMenu(true);
    return;
  }
  if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(current - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(current + 1); }
});

installContactForm();
