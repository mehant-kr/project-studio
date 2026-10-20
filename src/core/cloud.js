/* ---------- cloud sync: Supabase (Postgres) for the desktop and iPhone apps ----------
   The local database (db.js) stays the fast, offline copy; this mirrors the same
   one-row-per-record shape to the `records` table (supabase/migrations) and pulls
   other devices' changes back. Sign-in is email and password.

   A sync: rows that changed locally since the last sync (by hash) are pushed in
   one upsert; rows changed in the cloud since the cursor are pulled and merged,
   the newest write winning per record. Deletes travel as doc = null. Which rows
   the cloud holds, and the pull cursor, persist in localStorage per account. */
import { createClient } from '@supabase/supabase-js';
import { isDesktop } from './db.js';
import { D, applyPersisted, flushSave, lastSavedAt, onSave, persistedState, save } from './store.js';
import { fromRows, key, toRows } from './records.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
/* dev-only switch so the sync can be exercised in a browser */
const inBrowserForTests = import.meta.env.DEV && import.meta.env.VITE_CLOUD_IN_BROWSER === '1';
export const cloudConfigured = !!(URL_ && ANON);
export const cloudAvailable = cloudConfigured && (isDesktop || inBrowserForTests);

/* status: off · signedout · choose · ready · error */
export const CLOUD = { status: 'off', email: '', error: '', lastSync: 0, remoteCount: 0 };
const BASE_KEY = 'pindrop.cloud.v1';
/* rows that describe this device, not the workspace */
const DEVICE_ONLY = new Set([key('_meta', 'collapsed'), key('_meta', 'savedAt')]);
const PAGE = 1000;

let sb = null,
  user = null,
  channel = null,
  base = { user: null, cursor: null, hashes: {} },
  chain = Promise.resolve(),
  onChange = () => {},
  pushT = null,
  pullT = null;

function setStatus(status, error = '') {
  CLOUD.status = status;
  CLOUD.error = error;
  onChange('status');
}
export const errorText = e =>
  e instanceof TypeError || /fetch|network/i.test(e?.message || '')
    ? "Supabase can't be reached. Changes are kept on this device and upload when the connection is back."
    : e?.message || e?.error_description || e?.details || e?.hint || (e?.code ? 'Error ' + e.code : '') || 'Something went wrong talking to Supabase.';

/* stable JSON (sorted keys), since Postgres jsonb doesn't keep key order */
const canon = v =>
  Array.isArray(v)
    ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map(k => JSON.stringify(k) + ':' + canon(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v ?? null);
function hash(v) {
  const s = canon(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

function loadBase(uid) {
  try {
    const b = JSON.parse(localStorage.getItem(BASE_KEY) || 'null');
    if (b && b.user === uid) return b;
  } catch {
    /* unreadable: start over for this account */
  }
  return { user: uid, cursor: null, hashes: {} };
}
function saveBase() {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base));
  } catch {
    /* storage full: the next start re-checks every row */
  }
}

/* the workspace as cloud rows: key -> { kind, id, doc (parsed) } */
function localRows() {
  const out = new Map();
  for (const [k, [kind, id, doc]] of toRows(persistedState())) if (!DEVICE_ONLY.has(k)) out.set(k, { kind, id, doc: JSON.parse(doc) });
  return out;
}
async function fetchRows(since) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from('records')
      .select('kind,id,doc,updated_at')
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (since) q = q.gte('updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}
async function upsert(list) {
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500).map(r => ({ user_id: user.id, kind: r.kind, id: r.id, doc: r.doc }));
    const { error } = await sb.from('records').upsert(chunk, { onConflict: 'user_id,kind,id' });
    if (error) throw error;
  }
}

/* mode: 'merge' (normal), 'cloud' (replace this device with the cloud), 'local' (replace the cloud with this device) */
async function runSync(mode, pull) {
  if (!user) return;
  flushSave();
  const local = localRows();
  const changed = new Map();
  if (mode !== 'cloud') {
    for (const [k, r] of local) if (base.hashes[k] !== hash(r.doc)) changed.set(k, r);
    for (const k of Object.keys(base.hashes)) {
      if (local.has(k)) continue;
      const [kind, id] = k.split('\u001f');
      changed.set(k, { kind, id, doc: null });
    }
  }

  const remote = pull ? await fetchRows(mode === 'merge' ? base.cursor : null) : [];
  let cursor = base.cursor;
  const incoming = new Map();
  for (const r of remote) {
    if (!cursor || r.updated_at > cursor) cursor = r.updated_at;
    const k = key(r.kind, r.id);
    if (mode === 'merge' && (r.doc == null ? null : hash(r.doc)) === (base.hashes[k] ?? null)) continue; // nothing new, often our own write
    incoming.set(k, r);
  }

  if (mode === 'merge')
    for (const [k, r] of incoming) {
      if (!changed.has(k)) continue;
      // both sides changed this record: the newer write wins
      if (Date.parse(r.updated_at) > lastSavedAt()) changed.delete(k);
      else incoming.delete(k);
    }
  if (mode === 'local') {
    for (const r of remote) if (r.doc != null && !local.has(key(r.kind, r.id))) changed.set(key(r.kind, r.id), { kind: r.kind, id: r.id, doc: null });
    incoming.clear();
  }

  if (mode === 'cloud' || incoming.size) {
    const rows = mode === 'cloud' ? new Map() : new Map(local);
    for (const [k, r] of incoming) {
      if (r.doc == null) rows.delete(k);
      else rows.set(k, r);
    }
    const cur = toRows(persistedState());
    const list = [...rows.values()].map(r => ({ kind: r.kind, id: r.id, doc: JSON.stringify(r.doc) }));
    for (const k of DEVICE_ONLY) {
      const r = cur.get(k);
      if (r) list.push({ kind: r[0], id: r[1], doc: r[2] });
    }
    const j = fromRows(list);
    if (j) {
      if (mode === 'cloud') base.hashes = {};
      for (const [k, r] of incoming) {
        if (r.doc == null) delete base.hashes[k];
        else base.hashes[k] = hash(r.doc);
      }
      applyPersisted(j);
      save(); // the local database keeps the merged copy too
      flushSave();
      onChange('data');
    }
  }

  const push = [...changed.values()];
  if (push.length) {
    await upsert(push);
    for (const r of push) {
      const k = key(r.kind, r.id);
      if (r.doc == null) delete base.hashes[k];
      else base.hashes[k] = hash(r.doc);
    }
  }
  base.cursor = cursor;
  saveBase();
  CLOUD.lastSync = Date.now();
  setStatus('ready');
}
function queueSync(mode = 'merge', pull = true) {
  chain = chain.then(() => runSync(mode, pull)).catch(e => setStatus('error', errorText(e)));
  return chain;
}

function subscribe() {
  channel?.unsubscribe();
  channel = sb
    .channel('records-' + user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'user_id=eq.' + user.id }, () => {
      clearTimeout(pullT);
      pullT = setTimeout(() => queueSync('merge'), 300);
    })
    .subscribe();
}

async function begin(u) {
  user = u;
  CLOUD.email = u.email || CLOUD.email;
  base = loadBase(u.id);
  subscribe();
  if (base.cursor || Object.keys(base.hashes).length) return queueSync('merge');
  // first sync of this account on this device
  const { count, error } = await sb.from('records').select('id', { count: 'exact' }).not('doc', 'is', null).limit(1);
  if (error) throw error;
  const hasWork = D().tasks.length > 0 || D().projects.length > 0;
  if (count && hasWork) {
    CLOUD.remoteCount = count;
    setStatus('choose');
    return;
  }
  return queueSync(count ? 'cloud' : 'local');
}

/* ---------- sign-in and controls (called from Settings) ---------- */
export async function signIn(email, password) {
  CLOUD.email = email;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await begin(data.user);
}
export async function createAccount(email, password) {
  CLOUD.email = email;
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  // with "Confirm email" on, Supabase sends a link and returns no session
  if (!data.session)
    throw new Error(
      'Your Supabase project still requires email confirmation. Turn off "Confirm email" in Authentication → Sign In / Providers → Email, then try again.',
    );
  await begin(data.user);
}
export const chooseStart = mode => queueSync(mode);
export const syncNow = () => queueSync('merge');
export async function signOut() {
  await chain.catch(() => {});
  channel?.unsubscribe();
  channel = null;
  await sb.auth.signOut();
  user = null;
  try {
    localStorage.removeItem(BASE_KEY);
  } catch {
    /* nothing to clear */
  }
  CLOUD.lastSync = 0;
  setStatus('signedout');
}

/* call once at start-up, after the local database has loaded */
export async function startCloud(opts = {}) {
  if (!cloudAvailable) return;
  onChange = opts.onChange || onChange;
  sb = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  onSave(() => {
    if (!user || CLOUD.status === 'choose') return;
    clearTimeout(pushT);
    pushT = setTimeout(() => queueSync('merge', false), 400);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user && CLOUD.status !== 'choose') queueSync('merge');
  });
  addEventListener('online', () => user && CLOUD.status !== 'choose' && queueSync('merge'));
  const { data } = await sb.auth.getSession();
  if (data.session?.user) await begin(data.session.user);
  else setStatus('signedout');
}
