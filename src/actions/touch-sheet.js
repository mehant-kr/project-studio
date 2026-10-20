/* =====================================================================
   ACTIONS · TASK SHEET (phones): on a phone the task panel is a bottom
   sheet; drag it down by its handle or header to close it, as in iOS.
   ===================================================================== */
import { $ } from '../core/utils.js';
import { S } from '../core/store.js';
import { A } from './actions.js';

const CLOSE_AT = 110; // px pulled down that closes the sheet
const FLICK = 0.6; // px per ms: a quick flick closes it from anywhere

let g = null; // { sheet, y0, t0, dy, moving }
const phone = () => matchMedia('(max-width: 640px)').matches;

document.addEventListener(
  'touchstart',
  e => {
    g = null;
    if (e.touches.length !== 1 || !phone() || !S.ui.drawer) return;
    if (!e.target.closest?.('.drawer .sheet-grab, .drawer .drawer-h')) return;
    const sheet = $('.drawer');
    if (sheet) g = { sheet, y0: e.touches[0].clientY, t0: Date.now(), dy: 0, moving: false };
  },
  { passive: true },
);
document.addEventListener(
  'touchmove',
  e => {
    if (!g) return;
    const dy = e.touches[0].clientY - g.y0;
    if (!g.moving) {
      if (dy < 8) return;
      g.moving = true;
      g.sheet.style.transition = 'none';
    }
    e.preventDefault();
    g.dy = Math.max(0, dy);
    g.sheet.style.transform = `translateY(${g.dy}px)`;
    const scrim = $('.drawer-scrim.phone');
    if (scrim) scrim.style.opacity = String(Math.max(0, 1 - g.dy / (g.sheet.offsetHeight || 1)));
  },
  { passive: false },
);
function end() {
  if (!g?.moving) return (g = null);
  const { sheet, dy, t0 } = g;
  g = null;
  S.ui.suppressClick = true;
  setTimeout(() => (S.ui.suppressClick = false), 400);
  const close = dy > CLOSE_AT || dy / Math.max(1, Date.now() - t0) > FLICK;
  sheet.style.transition = 'transform 0.22s var(--ease)';
  sheet.style.transform = close ? 'translateY(100%)' : 'translateY(0)';
  const scrim = $('.drawer-scrim.phone');
  if (scrim) {
    scrim.style.transition = 'opacity 0.22s';
    scrim.style.opacity = close ? '0' : '1';
  }
  setTimeout(() => {
    if (close) A.closeDrawer();
    else sheet.style.transition = sheet.style.transform = '';
  }, 220);
}
document.addEventListener('touchend', end);
document.addEventListener('touchcancel', end);
