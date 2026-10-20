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
import { fromRows, key, toRows } from './records.js';

export const isDesktop = isTauri(); // the native app: macOS or iOS
export const isIOS = isDesktop && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
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
