/* =====================================================================
   ENTRY: styles, then every module in dependency order (several register
   global listeners or add handlers to the action table when they load), then boot.
   ===================================================================== */
import './styles/index.css';
import './core/utils.js';
import './core/icons.js';
import './core/constants.js';
import './data/seed.js';
import './core/store.js';
import './ui/helpers.js';
import './core/theme.js';
import './ui/toast.js';
import './ui/select.js';
import './shell/render.js';
import './shell/layout.js';
import './shell/skeletons.js';
import './shell/view-engine.js';
import './components/task-list.js';
import './pages/home.js';
import './pages/overview.js';
import './pages/my-tasks.js';
import './pages/tasks.js';
import './pages/inbox.js';
import './pages/notifications.js';
import './pages/favorites.js';
import './pages/projects.js';
import './pages/members.js';
import './pages/activity.js';
import './pages/search.js';
import './pages/errors.js';
import './pages/project.js';
import './views/project-overview.js';
import './views/board.js';
import './views/table.js';
import './views/calendar.js';
import './views/timeline.js';
import './views/files.js';
import './overlays/drawer.js';
import './overlays/modals.js';
import './overlays/popovers.js';
import './overlays/context-menu.js';
import './overlays/palette.js';
import './pages/settings.js';
import './pages/auth.js';
import './pages/design-system.js';
import './actions/actions.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import './features/teams.js';
import './features/subtasks.js';
import './features/archive.js';
import './actions/teams.js';
import './actions/subtasks.js';
import './actions/archive.js';
import './actions/side-peek.js';
import './actions/cloud.js';
import './actions/touch-drag.js';
import './actions/touch-swipe.js';
import './actions/touch-sheet.js';
import { S, D, task } from './core/store.js';
import { isDesktop, isIOS, startDb, flushDb } from './core/db.js';
import { CLOUD, cloudAvailable, startCloud } from './core/cloud.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from './ui/toast.js';
import { setHaptics } from './core/haptics.js';
import { A } from './actions/actions.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';

(async function init() {
  if (isDesktop) {
    // the desktop app loads the SQLite database before the first render
    try {
      await startDb({ onError: e => toast(`Couldn't save to the database. ${e}`, { kind: 'err', ms: 8000 }) });
    } catch (e) {
      setTimeout(() => toast(`Couldn't open the database; changes are kept in the app cache only. ${e}`, { kind: 'err', ms: 10000 }));
    }
    // macOS: finish saving before the window closes; iOS has no window close
    if (!isIOS) getCurrentWindow().onCloseRequested(flushDb);
    // real haptics on iPhone (core/haptics.js is a no-op elsewhere)
    if (isIOS)
      import('@tauri-apps/plugin-haptics')
        .then(h => setHaptics(kind => (kind === 'success' ? h.notificationFeedback('success') : h.impactFeedback(kind))))
        .catch(() => {});
    // iOS can end a backgrounded app without warning, so save the moment the app is hidden
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushDb());
  }
  if (cloudAvailable) {
    // cloud sync runs alongside: it never blocks start-up, and the app works offline
    let lastErr = '';
    startCloud({
      onChange: what => {
        if (what === 'data') {
          if (S.ui.drawer && !task(S.ui.drawer)) S.ui.drawer = null;
          if (!S.ui.auth) render();
          return;
        }
        if (CLOUD.status === 'error' && CLOUD.error !== lastErr) toast(`Cloud sync paused. ${CLOUD.error}`, { kind: 'err', ms: 8000 });
        lastErr = CLOUD.status === 'error' ? CLOUD.error : '';
        // only Settings shows the sync status; re-rendering elsewhere could disturb typing
        if (S.ui.route === 'settings' && !S.ui.auth) render();
      },
    }).catch(e => toast(`Cloud sync couldn't start. ${e?.message || e}`, { kind: 'err', ms: 8000 }));
  }
  document.documentElement.lang = 'en';
  if (!document.getElementById('sr-live')) {
    const l = document.createElement('div');
    l.id = 'sr-live';
    l.className = 'sr';
    l.setAttribute('aria-live', 'polite');
    document.body.appendChild(l);
  }
  const h = (location.hash || '').slice(1);
  const authRoutes = ['login', 'signup', 'forgot', 'reset', 'verify', 'onboarding'];
  if (authRoutes.includes(h)) S.ui.auth = h;
  else if (h && ROUTE_NAMES[h]) S.ui.route = h;
  else S.ui.route = S.prefs.home || 'home';
  render();
})();

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__pindrop = { S, D, A, go, render };
