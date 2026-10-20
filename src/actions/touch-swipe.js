/* =====================================================================
   ACTIONS · SWIPE ACTIONS on task rows (touch), as in iOS Mail and Things:
   swipe left to complete (or reopen), swipe right to snooze by a day.
   Past about a third of the row the action is armed (with a haptic tap);
   letting go then runs it, otherwise the row springs back.
   ===================================================================== */
import { TODAY, addD, diffD, fmtDate, iso, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, task } from '../core/store.js';
import { haptic } from '../core/haptics.js';
import { toast } from '../ui/toast.js';
import { DRAG } from './drag-drop.js';
import { A, updateTask } from './actions.js';

const START = 12; // px of sideways movement before it counts as a swipe
const ARM = 0.32; // share of the row width that arms the action

let g = null; // the gesture: { row, id, x0, y0, dx, swiping, under, armed }

function snooze(id) {
  const t = task(id);
  if (!t) return;
  const prev = { due: t.due, start: t.start };
  const from = t.due && parse(t.due) > TODAY ? parse(t.due) : TODAY;
  const due = iso(addD(from, 1));
  // keep the start-to-due span, as rescheduling on the calendar does
  const len = t.start && t.due ? diffD(parse(t.due), parse(t.start)) : null;
  updateTask(id, { due, ...(len != null ? { start: iso(addD(parse(due), -len)) } : {}) });
  haptic('light');
  toast(`Snoozed “${t.title}” to ${fmtDate(due)}`, { action: 'Undo', onAction: () => updateTask(id, prev) });
}

function begin() {
  g.swiping = true;
  const { row } = g;
  const done = task(g.id)?.status === 'done';
  // the coloured band sits behind the row, in the same container, so they share a stacking context
  const under = document.createElement('div');
  under.className = 'swipe-under';
  under.setAttribute('aria-hidden', 'true');
  under.innerHTML = `<span class="sw-snooze">${ic('alarm-clock', 18)}Snooze</span><span class="sw-done">${ic(done ? 'rotate-ccw' : 'check', 18)}${done ? 'Reopen' : 'Complete'}</span>`;
  Object.assign(under.style, { left: row.offsetLeft + 'px', top: row.offsetTop + 'px', width: row.offsetWidth + 'px', height: row.offsetHeight + 'px' });
  row.after(under);
  row.classList.add('swiping');
  g.under = under;
}

function update(dx) {
  const w = g.row.offsetWidth;
  dx = Math.max(-w, Math.min(w, dx));
  g.dx = dx;
  g.row.style.transform = `translateX(${dx}px)`;
  g.under.classList.toggle('to-done', dx < 0);
  g.under.classList.toggle('to-snooze', dx > 0);
  const armed = Math.abs(dx) > w * ARM;
  if (armed !== g.armed) {
    g.armed = armed;
    g.under.classList.toggle('armed', armed);
    if (armed) haptic('light');
  }
}

function release(run) {
  const { row, under, id, dx, armed } = g;
  g = null;
  // the finger lifts on the row: don't also open the task
  S.ui.suppressClick = true;
  setTimeout(() => (S.ui.suppressClick = false), 400);
  row.style.transition = 'transform 0.2s var(--ease)';
  row.style.transform = 'translateX(0)';
  setTimeout(() => {
    under.remove();
    row.classList.remove('swiping');
    row.style.transition = row.style.transform = '';
    if (run && armed) dx < 0 ? A.toggleDone({ dataset: { id } }) : snooze(id);
  }, 200);
}

document.addEventListener(
  'touchstart',
  e => {
    g = null;
    if (e.touches.length !== 1 || DRAG) return;
    const row = e.target.closest?.('[data-task-row]');
    if (!row || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const t = e.touches[0];
    g = { row, id: row.dataset.taskRow, x0: t.clientX, y0: t.clientY, dx: 0, swiping: false, under: null, armed: false };
  },
  { passive: true },
);
document.addEventListener(
  'touchmove',
  e => {
    if (!g) return;
    if (DRAG) {
      // a hold-to-drag took over
      if (g.swiping) release(false);
      g = null;
      return;
    }
    const t = e.touches[0];
    const dx = t.clientX - g.x0,
      dy = t.clientY - g.y0;
    if (!g.swiping) {
      if (Math.abs(dx) > START && Math.abs(dx) > Math.abs(dy) * 1.4) begin();
      else {
        if (Math.abs(dy) > START) g = null; // a vertical scroll
        return;
      }
    }
    e.preventDefault(); // no page scroll while swiping
    update(dx);
  },
  { passive: false },
);
document.addEventListener('touchend', () => g?.swiping && release(true));
document.addEventListener('touchcancel', () => g?.swiping && release(false));
