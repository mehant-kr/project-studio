/* ---------- desktop app: SQLite database (Tauri SQL plugin) ----------
   The database is pindrop.db in the app's config folder
   (~/Library/Application Support/com.pindrop.studio on macOS). Every list of
   records in the workspace (tasks, projects, comments, …) is stored one row
   per record; everything else is a row under kind '_meta'. Each save writes
   only the rows that changed, in one statement, so a save is all or nothing.
   localStorage stays as a cache; on start the newer copy wins. */
import { isTauri } from '@tauri-apps/api/core';
import { appConfigDir, join } from '@tauri-apps/api/path';
import Database from '@tauri-apps/plugin-sql';
import { applyPersisted, flushSave, lastSavedAt, onSave, persistedState } from './store.js';

export const isDesktop = isTauri();
export const DB = { path: '', error: '' };
let db = null;

const SCHEMA = `CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,  -- 'tasks', 'projects', … or '_meta'
  id   TEXT NOT NULL,
  doc  TEXT,           -- the record as JSON; NULL marks a deleted row until the next start
  PRIMARY KEY (kind, id)
) WITHOUT ROWID`;
/* rows arrive as one JSON array of [kind, id, doc] so the whole save is a single statement */
const UPSERT = `INSERT INTO records (kind, id, doc)
  SELECT value ->> 0, value ->> 1, value ->> 2 FROM json_each($1) WHERE true
  ON CONFLICT (kind, id) DO UPDATE SET doc = excluded.doc`;

/* ---------- workspace state <-> rows ---------- */
const isList = v => Array.isArray(v) && v.every(x => x && typeof x === 'object' && typeof x.id === 'string') && new Set(v.map(x => x.id)).size === v.length;
const key = (kind, id) => kind + '\u001f' + id;
function toRows(j) {
  const rows = new Map();
  const put = (kind, id, v) => rows.set(key(kind, id), [kind, id, JSON.stringify(v)]);
  for (const [k, v] of Object.entries(j.data)) {
    if (isList(v)) {
      v.forEach(r => put(k, r.id, r));
      put(
        '_meta',
        'order:' + k,
        v.map(r => r.id),
      );
    } else put('_meta', 'data:' + k, v);
  }
  put('_meta', 'prefs', j.prefs);
  put('_meta', 'views', j.views);
  put('_meta', 'collapsed', j.collapsed);
  put('_meta', 'savedAt', j.savedAt);
  return rows;
}
function fromRows(list) {
  const meta = {},
    kinds = {};
  for (const { kind, id, doc } of list) {
    const v = JSON.parse(doc);
    if (kind === '_meta') meta[id] = v;
    else (kinds[kind] ||= new Map()).set(id, v);
  }
  if (!('savedAt' in meta)) return null;
  const data = {};
  for (const [id, v] of Object.entries(meta)) {
    if (id.startsWith('data:')) data[id.slice(5)] = v;
    if (id.startsWith('order:')) {
      const k = id.slice(6),
        recs = kinds[k] || new Map();
      data[k] = v.map(rid => recs.get(rid)).filter(Boolean);
      for (const [rid, r] of recs) if (!v.includes(rid)) data[k].push(r);
    }
  }
  return { data, prefs: meta.prefs, views: meta.views, collapsed: meta.collapsed, savedAt: meta.savedAt };
}

/* ---------- writing: diff against what the database holds, one save at a time ---------- */
let written = new Map(),
  pending = null,
  writing = null;
function queue(j) {
  if (!db) return;
  pending = j;
  writing ||= drain();
}
async function drain() {
  while (pending) {
    const rows = toRows(pending);
    pending = null;
    const changes = [];
    for (const [k, r] of rows) if (written.get(k)?.[2] !== r[2]) changes.push(r);
    for (const [k, r] of written) if (!rows.has(k)) changes.push([r[0], r[1], null]);
    if (!changes.length) continue;
    try {
      await db.execute(UPSERT, [JSON.stringify(changes)]);
      written = rows;
      DB.error = '';
    } catch (e) {
      DB.error = String(e);
      onError?.(DB.error);
    }
  }
  writing = null;
}
let onError = null;

/* open the database and reconcile it with the cached state; resolves to 'loaded' when the
   database's copy replaced the cache, 'saved' when the cache was written to the database */
export async function startDb(opts = {}) {
  onError = opts.onError;
  DB.path = await join(await appConfigDir(), 'pindrop.db');
  db = await Database.load('sqlite:pindrop.db');
  await db.execute(SCHEMA);
  await db.execute('DELETE FROM records WHERE doc IS NULL');
  const list = await db.select('SELECT kind, id, doc FROM records');
  const j = fromRows(list);
  written = new Map(list.map(r => [key(r.kind, r.id), [r.kind, r.id, r.doc]]));
  onSave(queue);
  if (j && j.savedAt >= lastSavedAt()) {
    applyPersisted(j);
    return 'loaded';
  }
  queue(persistedState());
  await writing;
  return 'saved';
}

/* finish any pending write; used before the window closes */
export async function flushDb() {
  flushSave();
  await writing;
}
