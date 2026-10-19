/* =====================================================================
   ACTIONS · SIDEBAR PEEK: a collapsed sidebar expands over the page after
   the pointer rests on it for 200ms, and collapses when the pointer leaves
   ===================================================================== */
import { $ } from '../core/utils.js';
import { S } from '../core/store.js';
import { makeFocusable } from '../shell/render.js';
import { renderSidebar } from '../shell/layout.js';

const DELAY = 200;
let timer = null;
const cancel = () => {
  clearTimeout(timer);
  timer = null;
};
/* below 900px the sidebar is the slide-in menu, which has no collapsed state */
const narrow = () => matchMedia('(max-width: 900px)').matches;

/* redraw only the sidebar, so hovering never re-renders the page itself */
function setPeek(on) {
  cancel();
  if (!!S.ui.peek === on) return;
  S.ui.peek = on;
  const shell = $('.shell'),
    side = $('.side');
  if (!shell || !side) return;
  const top = $('.side-scroll')?.scrollTop || 0;
  shell.classList.toggle('peek', on);
  side.outerHTML = renderSidebar();
  makeFocusable();
  const sc = $('.side-scroll');
  if (sc) sc.scrollTop = top;
  if (on) $('.side')?.classList.add('fx-peek');
}

document.addEventListener('pointerover', e => {
  if (!S.ui.collapsed || S.ui.auth || e.pointerType === 'touch' || narrow()) return;
  if (e.target.closest?.('.side')) {
    if (!S.ui.peek && !timer && !S.ui.peekBlocked) timer = setTimeout(() => setPeek(true), DELAY);
    return;
  }
  // a menu opened from the sidebar (workspace, help, profile, project options) keeps it open
  if (S.ui.pop && e.target.closest?.('#layer')) return;
  S.ui.peekBlocked = false;
  if (timer) cancel();
  if (S.ui.peek) setPeek(false);
});
/* pointer left the window */
document.addEventListener('pointerout', e => {
  if (e.relatedTarget || !S.ui.collapsed) return;
  S.ui.peekBlocked = false;
  if (timer) cancel();
  if (S.ui.peek && !S.ui.pop) setPeek(false);
});
