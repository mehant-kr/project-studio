/* =====================================================================
   ACTIONS · TOUCH DRAG: press and hold a task (list row or board card),
   a calendar event or a sidebar project, then drag it. Touch screens never
   fire HTML drag-and-drop, so this drives the same handlers as the mouse
   (drag-drop.js) with synthetic events: same drop lines, same results.
   ===================================================================== */
import { $ } from '../core/utils.js';
import { S } from '../core/store.js';
import { haptic } from '../core/haptics.js';
import { DRAG, dragEnd, dragOver, dragStart, drop } from './drag-drop.js';

const HOLD = 450; // ms to hold before the item lifts
const SLOP = 8; // px the finger may move during the hold; more is a scroll
const EDGE = 64; // px from a scroll edge where auto-scroll starts

let press = null, // { x, y, src, timer } while holding
  drag = null; // { ghost, dx, dy, x, y, raf } while dragging

/* what a touch on this element would drag: { target for dragStart, element that moves } */
function source(el) {
  if (!el?.closest || el.closest('input, textarea, select, [contenteditable="true"]')) return null;
  const row = el.closest('.trow[data-task-row]');
  if (row) {
    const handle = row.querySelector('[data-drag-row][draggable="true"]');
    return handle ? { target: handle, vis: row } : null;
  }
  const item = el.closest('[data-drag-card], [data-drag-cal], [data-drag-proj]');
  return item ? { target: item, vis: item } : null;
}
const cancelPress = () => {
  clearTimeout(press?.timer);
  press = null;
};

function begin() {
  const { src, x, y } = press;
  press = null;
  dragStart({ target: src.target, dataTransfer: null });
  if (!DRAG) return;
  const r = src.vis.getBoundingClientRect();
  const ghost = src.vis.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('touch-ghost');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.appendChild(ghost);
  drag = { ghost, dx: x - r.left, dy: y - r.top, x, y, raf: 0 };
  haptic('medium');
  move(x, y);
  drag.raf = requestAnimationFrame(edgeScroll);
}

function move(x, y) {
  drag.x = x;
  drag.y = y;
  drag.ghost.style.left = x - drag.dx + 'px';
  drag.ghost.style.top = y - drag.dy + 'px';
  const el = document.elementFromPoint(x, y); // the ghost ignores pointer events
  if (el) dragOver({ target: el, clientX: x, clientY: y, preventDefault() {}, dataTransfer: null });
}

/* near an edge, scroll the list (vertically) or the board (sideways) so items can travel further */
function edgeScroll() {
  if (!drag) return;
  const { x, y } = drag;
  const el = document.elementFromPoint(x, y);
  let moved = false;
  const col = el?.closest('.bcol-b');
  const v = col && col.scrollHeight > col.clientHeight ? col : $('.content');
  if (v) {
    const r = v.getBoundingClientRect();
    const nav = $('.bottomnav');
    const bottom = nav && nav.offsetParent ? Math.min(r.bottom, nav.getBoundingClientRect().top) : r.bottom;
    const step = y < r.top + EDGE ? -Math.ceil((r.top + EDGE - y) / 6) : y > bottom - EDGE ? Math.ceil((y - bottom + EDGE) / 6) : 0;
    if (step) {
      const before = v.scrollTop;
      v.scrollTop += step;
      moved = v.scrollTop !== before;
    }
  }
  const board = el?.closest('.board');
  if (board) {
    const r = board.getBoundingClientRect();
    const step = x < r.left + EDGE ? -Math.ceil((r.left + EDGE - x) / 6) : x > r.right - EDGE ? Math.ceil((x - r.right + EDGE) / 6) : 0;
    if (step) {
      const before = board.scrollLeft;
      board.scrollLeft += step;
      moved = moved || board.scrollLeft !== before;
    }
  }
  if (moved) move(x, y);
  drag.raf = requestAnimationFrame(edgeScroll);
}

function finish(commit) {
  cancelAnimationFrame(drag.raf);
  drag.ghost.remove();
  const { x, y } = drag;
  drag = null;
  // the lift ends in a tap on the item: don't let it also open the task
  S.ui.suppressClick = true;
  setTimeout(() => (S.ui.suppressClick = false), 400);
  if (commit && DRAG) haptic('light');
  if (commit && DRAG) drop({ target: document.elementFromPoint(x, y) || document.body, preventDefault() {}, dataTransfer: null });
  dragEnd();
}

document.addEventListener(
  'touchstart',
  e => {
    if (drag) return;
    cancelPress();
    if (e.touches.length !== 1) return;
    const src = source(e.target);
    if (!src) return;
    const t = e.touches[0];
    press = { x: t.clientX, y: t.clientY, src, timer: setTimeout(begin, HOLD) };
  },
  { passive: true },
);
document.addEventListener(
  'touchmove',
  e => {
    const t = e.touches[0];
    if (drag) {
      e.preventDefault(); // the page mustn't scroll under the finger while dragging
      move(t.clientX, t.clientY);
    } else if (press && Math.hypot(t.clientX - press.x, t.clientY - press.y) > SLOP) cancelPress();
  },
  { passive: false },
);
document.addEventListener('touchend', () => (drag ? finish(true) : cancelPress()));
document.addEventListener('touchcancel', () => (drag ? finish(false) : cancelPress()));
/* Android opens a context menu on long press; the hold is ours */
document.addEventListener(
  'contextmenu',
  e => {
    if (!press && !drag) return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
