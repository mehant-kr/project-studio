/* =====================================================================
   PHONE SCREENS: on phone-width screens (the iPhone app, mobile web),
   Today, My Tasks, Projects and Inbox use these iOS-style layouts.
   Today follows the approved dark design (design/ios-dark/); the others
   still use the earlier light prototype until they are rebuilt.
   Wider screens keep the regular pages.
   ===================================================================== */
import { TODAY, ago, diffD, esc, fmtDate, parse } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, isOver, pColor, proj, progressOf, tasksOf, visibleProjects } from '../core/store.js';
import { pIcon } from '../ui/helpers.js';
import { notifText } from './inbox.js';

export const isPhone = () => matchMedia('(max-width: 640px)').matches;
const SCREENS = { home: iToday, mytasks: mMyTasks, projects: mProjects, inbox: mInbox };
/* the phone screen for a route, or null to use the regular page */
export const phoneScreen = route => (isPhone() && SCREENS[route] ? SCREENS[route] : null);
/* routes already built in the iOS dark design (design/ios-dark/); the rest keep the light phone screens */
const IOS = new Set(['home']);
export const isIos = route => isPhone() && IOS.has(route);

/* ---------- pieces ---------- */
function dueOf(t) {
  if (!t.due) return { text: '', cls: '' };
  const d = diffD(parse(t.due), TODAY);
  const text =
    d === 0
      ? 'Today'
      : d === 1
        ? 'Tomorrow'
        : d === -1
          ? 'Yesterday'
          : d > 1 && d < 7
            ? parse(t.due).toLocaleDateString('en-US', { weekday: 'short' })
            : fmtDate(t.due);
  const cls = t.status === 'done' ? '' : d < 0 ? 'late' : d === 0 ? 'today' : '';
  return { text, cls };
}
const dueTime = t => (t.due ? parse(t.due).getTime() : Infinity);
export function mTaskRow(t) {
  const p = proj(t.project);
  const done = t.status === 'done';
  const due = dueOf(t);
  const urgent = !done && (isOver(t) || t.priority === 'urgent');
  return `<div class="m-row" data-task-row="${t.id}">
    <button class="m-check ${done ? 'on' : ''} ${urgent ? 'urgent' : ''}" data-a="toggleDone" data-id="${t.id}" aria-label="${done ? 'Mark not done' : 'Complete'}: ${esc(t.title)}">${done ? ic('check', 13) : ''}</button>
    <button class="m-row-b" data-a="openTask" data-id="${t.id}">
      <span class="m-row-t"><span class="m-title ${done ? 'done' : ''}">${esc(t.title)}</span>${p ? `<span class="m-sub"><i style="background:${pColor(p)}"></i>${esc(p.name)}</span>` : ''}</span>
      ${due.text ? `<span class="m-due ${due.cls}">${due.text}</span>` : ''}
    </button>
  </div>`;
}
const seg = (k, cur, opts) =>
  `<div class="m-seg" role="group">${opts.map(([v, n]) => `<button class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}" data-a="set" data-k="${k}" data-v="${v}">${n}</button>`).join('')}</div>`;
const empty = (icon, title, text) => `<div class="m-empty">${ic(icon, 22)}<b>${title}</b><span>${text}</span></div>`;
const myOpen = () => allTasks().filter(t => t.assignee === D().me && t.status !== 'done');

/* ---------- Today (iOS dark design, design/ios-dark/Main.dc.html) ---------- */
const FLAG = ['urgent', 'high'];
const flagged = t => FLAG.includes(t.priority);
function iTaskRow(t) {
  const p = proj(t.project);
  const due = dueOf(t);
  const meta = [p?.name, due.text].filter(Boolean).map(esc).join(' · ');
  const flag = flagged(t);
  return `<div class="ios-task" data-task-row="${t.id}">
    <button class="ios-check" style="${flag ? '--ring:var(--amber)' : ''}" data-a="toggleDone" data-id="${t.id}" aria-label="Complete: ${esc(t.title)}"><span></span></button>
    <button class="ios-task-b" data-a="openTask" data-id="${t.id}">
      <span class="ios-task-t"><span class="ios-title">${esc(t.title)}</span>${meta ? `<span class="ios-meta ${due.cls === 'late' ? 'late' : ''}">${meta}</span>` : ''}</span>
      ${flag ? `<span class="ios-flag" role="img" aria-label="Flagged">${ic('flag', 17)}</span>` : ''}
    </button>
  </div>`;
}
function iToday() {
  const d = D();
  const mine = myOpen();
  const day = t => (t.due ? diffD(parse(t.due), TODAY) : null);
  const today = mine.filter(t => day(t) !== null && day(t) <= 0);
  const date = TODAY.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const next = mine
    .slice()
    .sort((a, b) => dueTime(a) - dueTime(b))
    .slice(0, 5);
  const projs = visibleProjects()
    .filter(p => p.status !== 'complete')
    .slice(0, 5);
  const tile = (n, label, icon, c, act) =>
    `<button class="ios-tile" ${act}><span class="ios-tile-top"><span class="ios-tile-ic" style="--c:${c}">${ic(icon, 18)}</span><b>${n}</b></span><span>${label}</span></button>`;
  const more = r => `<button class="ios-more" data-a="go" data-r="${r}">See All</button>`;
  return `<div class="ios-page">
    <nav class="ios-nav">
      <button class="ios-ws" data-a="go" data-r="settings" aria-label="Workspace and settings">${wsLogo(d.ws, 30)}</button>
      <span class="ios-nav-r">
        <button class="ios-ibtn" data-a="go" data-r="search" aria-label="Search">${ic('search', 22)}</button>
        <button class="ios-ibtn" data-a="newTask" aria-label="New task">${ic('plus', 26)}</button>
      </span>
    </nav>
    <header class="ios-head"><h1>Today</h1><p>${date}</p></header>
    <div class="ios-tiles">
      ${tile(today.length, 'Today', 'sun', '#5e5ce6', 'data-a="goWith" data-r="mytasks" data-k="mTaskFilter" data-v="today"')}
      ${tile(mine.filter(t => t.due).length, 'Scheduled', 'calendar', '#ff453a', 'data-a="go" data-r="calendar"')}
      ${tile(mine.length, 'All open', 'inbox', '#636366', 'data-a="goWith" data-r="mytasks" data-k="mTaskFilter" data-v="all"')}
      ${tile(mine.filter(flagged).length, 'Flagged', 'flag', '#ff9f0a', 'data-a="goWith" data-r="mytasks" data-k="mTaskFilter" data-v="all"')}
    </div>
    <section class="ios-sec">
      <div class="ios-sec-h"><h2>Up Next</h2>${more('mytasks')}</div>
      ${next.length ? `<div class="ios-card">${next.map(iTaskRow).join('')}</div>` : `<div class="ios-card ios-empty"><b>All clear</b><span>Tap + to add a task.</span></div>`}
    </section>
    ${
      projs.length
        ? `<section class="ios-sec">
      <div class="ios-sec-h"><h2>Projects</h2>${more('projects')}</div>
      <div class="ios-card">${projs
        .map(p => {
          const ts = tasksOf(p.id);
          const done = ts.filter(t => t.status === 'done').length;
          return `<button class="ios-proj" data-a="go" data-r="project" data-id="${p.id}"><span class="ios-proj-ic" style="--c:${pColor(p)}">${ic(p.icon, 17)}</span><span class="ios-proj-b"><span class="ios-proj-n">${esc(p.name)}</span><span class="ios-proj-c">${done} of ${ts.length}</span>${ic('chevron-right', 16)}</span></button>`;
        })
        .join('')}</div>
    </section>`
        : ''
    }
  </div>`;
}

/* ---------- My Tasks ---------- */
function mMyTasks() {
  const f = ['all', 'today', 'upcoming'].includes(S.ui.mTaskFilter) ? S.ui.mTaskFilter : 'all';
  const mine = allTasks().filter(t => t.assignee === D().me);
  const open = mine.filter(t => t.status !== 'done').sort((a, b) => dueTime(a) - dueTime(b));
  const doneToday = mine.filter(t => t.status === 'done' && t.updated && diffD(new Date(t.updated), TODAY) === 0).length;
  const day = t => (t.due ? diffD(parse(t.due), TODAY) : null);
  const groups = [
    { name: 'Overdue', cls: 'late', show: f !== 'upcoming', tasks: open.filter(t => day(t) !== null && day(t) < 0) },
    { name: 'Today', cls: 'accent', show: f !== 'upcoming', tasks: open.filter(t => day(t) === 0) },
    { name: 'This week', cls: '', show: f !== 'today', tasks: open.filter(t => day(t) > 0 && day(t) < 7) },
    { name: 'Later', cls: '', show: f !== 'today', tasks: open.filter(t => day(t) >= 7) },
    { name: 'No date', cls: '', show: f === 'all', tasks: open.filter(t => day(t) === null) },
  ].filter(g => g.show && g.tasks.length);
  return `<div class="m-page">
    <div class="m-top"><span class="sp"></span><button class="m-ibtn accent" data-a="go" data-r="tasks" aria-label="All tasks and filters">${ic('sliders-horizontal', 20)}</button></div>
    <header class="m-head"><h1>My Tasks</h1><p>${open.length} open · ${doneToday} done today</p></header>
    ${seg('mTaskFilter', f, [
      ['all', 'All'],
      ['today', 'Today'],
      ['upcoming', 'Upcoming'],
    ])}
    ${
      groups.length
        ? groups
            .map(
              g =>
                `<section class="m-sec"><h2 class="m-group ${g.cls}">${g.name} <span>${g.tasks.length}</span></h2><div class="m-card">${g.tasks.map(mTaskRow).join('')}</div></section>`,
            )
            .join('') + '<p class="m-hint">Swipe a task left to complete it, right to snooze it.</p>'
        : empty('circle-check', f === 'today' ? 'Nothing due today' : 'No open tasks', 'Tap + to add a task.')
    }
  </div>`;
}

/* ---------- Projects ---------- */
function mProjects() {
  const q = (S.ui.mProjQ || '').trim().toLowerCase();
  const ps = visibleProjects().filter(p => !q || p.name.toLowerCase().includes(q));
  const active = ps.filter(p => p.status !== 'complete');
  const done = ps.filter(p => p.status === 'complete');
  const card = p => {
    const pct = progressOf(p.id);
    const n = tasksOf(p.id).length;
    const st = PSTAT[p.status] || PSTAT.planning;
    return `<button class="m-card m-proj" data-a="go" data-r="project" data-id="${p.id}">
      <span class="m-proj-row">${pIcon(p, 'lg', 20)}<span class="m-proj-t"><b>${esc(p.name)}</b><span>${n} task${n === 1 ? '' : 's'}${p.due ? ' · due ' + fmtDate(p.due) : ''}</span></span>${ic('chevron-right', 18)}</span>
      <span class="m-proj-row"><span class="m-chip" style="--c:${st.c}">${st.name}</span><span class="m-bar grow"><i style="width:${pct}%;background:${pColor(p)}"></i></span><span class="m-pct">${pct}%</span></span>
    </button>`;
  };
  return `<div class="m-page">
    <div class="m-top"><span class="sp"></span><button class="m-ibtn accent" data-a="newProject" aria-label="New project">${ic('plus', 22)}</button></div>
    <header class="m-head"><h1>Projects</h1></header>
    <label class="m-search">${ic('search', 17)}<span class="sr">Search projects</span><input id="m-proj-q" type="search" placeholder="Search" value="${esc(S.ui.mProjQ || '')}" data-in="mProjQ" autocomplete="off"></label>
    ${active.length ? `<section class="m-sec"><h2 class="m-group">Active <span>${active.length}</span></h2><div class="m-stack">${active.map(card).join('')}</div></section>` : ''}
    ${
      done.length
        ? `<section class="m-sec"><h2 class="m-group">Completed <span>${done.length}</span></h2><div class="m-card">${done.map(p => `<button class="m-row-b m-done-proj" data-a="go" data-r="project" data-id="${p.id}"><span class="m-tick">${ic('check', 15)}</span><b>${esc(p.name)}</b>${p.due ? `<span class="m-due">${fmtDate(p.due)}</span>` : ''}</button>`).join('')}</div></section>`
        : ''
    }
    ${!ps.length ? empty('folder-kanban', q ? 'No matching projects' : 'No projects yet', q ? 'Try another name.' : 'Tap + to create one.') : ''}
  </div>`;
}

/* ---------- Inbox ---------- */
function mInbox() {
  const cat = ['all', 'mention', 'assign'].includes(S.ui.inboxCat) ? S.ui.inboxCat : 'all';
  const all = D()
    .notifs.slice()
    .sort((a, b) => b.at - a.at);
  const unread = all.filter(n => !n.read).length;
  const ns = all.filter(n => cat === 'all' || (cat === 'mention' ? n.type === 'mention' || n.type === 'comment' : n.type === 'assign'));
  const look = {
    mention: ['at-sign', 'var(--accent)'],
    comment: ['message-circle', 'var(--text-2)'],
    assign: ['user-check', 'var(--green)'],
    update: ['alarm-clock', 'var(--red)'],
  };
  const item = n => {
    const t = n.task ? D().tasks.find(x => x.id === n.task) : null;
    const p = n.project ? proj(n.project) : t ? proj(t.project) : null;
    const [icon, c] = look[n.type] || look.update;
    return `<button class="m-notif ${n.read ? '' : 'unread'}" data-a="openNotif" data-id="${n.id}">
      <span class="m-nicon" style="--c:${c}">${ic(icon, 18)}</span>
      <span class="m-ntext"><span>${notifText(n)}</span>${n.snippet ? `<span class="m-snip">${esc(n.snippet)}</span>` : ''}<span class="m-sub">${p ? `<i style="background:${pColor(p)}"></i>${esc(p.name)} · ` : ''}${ago(n.at)}</span></span>
      ${n.read ? '' : '<i class="m-unread" aria-label="Unread"></i>'}
    </button>`;
  };
  return `<div class="m-page">
    <div class="m-top"><span class="sp"></span>${unread ? `<button class="m-link" data-a="markAllRead">Mark all read</button>` : ''}</div>
    <header class="m-head"><h1>Inbox</h1><p>${unread ? `${unread} unread` : 'All caught up'}</p></header>
    ${seg('inboxCat', cat, [
      ['all', 'All'],
      ['mention', 'Mentions'],
      ['assign', 'Assigned'],
    ])}
    ${ns.length ? `<div class="m-card m-notifs">${ns.map(item).join('')}</div>` : empty('inbox', "You're all caught up", 'Mentions, assignments and reminders show up here.')}
  </div>`;
}
