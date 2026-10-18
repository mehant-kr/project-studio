/* ---------- data file: mirror the store into a JSON file on disk ----------
   Uses the File System Access API (Chrome, Edge). localStorage stays the fast
   cache; the file is written after every save. The file handle is kept in
   IndexedDB so the same file reconnects on the next visit. Each saved state
   carries `savedAt`, so on reconnect the newer of file and cache wins. */
import { applyPersisted, isPersisted, lastSavedAt, onSave, persistedState } from './store.js';

export const fileSupported = typeof window.showSaveFilePicker === 'function';
const PICK = { id: 'gr8r-data', types: [{ description: 'Gr8r data', accept: { 'application/json': ['.json'] } }] };

/* status: off (no file) · locked (needs a click to allow access) · ready · error */
export const FS = { status: 'off', name: '', handle: null, mtime: 0, error: '' };
const listeners = [];
export const onFileStatus = fn => listeners.push(fn);
function setStatus(status, error = '') {
  FS.status = status;
  FS.error = error;
  listeners.forEach(fn => fn(FS));
}

/* ---------- handle storage (IndexedDB is the only place a handle can live) ---------- */
function kv(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('gr8r', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
const loadHandle = () => kv('readonly', s => s.get('dataFile'));
const storeHandle = h => kv('readwrite', s => (h ? s.put(h, 'dataFile') : s.delete('dataFile')));

/* ---------- reading and writing ---------- */
async function readFile(h) {
  const f = await h.getFile();
  const text = (await f.text()).trim();
  if (!text) return { j: null, mtime: f.lastModified };
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${h.name} isn't valid JSON.`);
  }
  if (!isPersisted(j)) throw new Error(`${h.name} isn't a Gr8r data file.`);
  return { j, mtime: f.lastModified };
}
let writing = null,
  pending = null;
function queueWrite(j) {
  if (FS.status !== 'ready') return;
  pending = j;
  writing ||= drain();
}
async function drain() {
  while (pending) {
    const j = pending;
    pending = null;
    try {
      const w = await FS.handle.createWritable();
      await w.write(JSON.stringify(j, null, 2));
      await w.close();
      FS.mtime = (await FS.handle.getFile()).lastModified;
    } catch (e) {
      pending = null;
      setStatus('error', e.name === 'NotFoundError' ? `${FS.name} was moved or deleted.` : e.message || 'Writing the data file failed.');
    }
  }
  writing = null;
}
onSave(queueWrite);

/* prefer: 'local' writes the open workspace to the file, 'file' loads the file,
   'newest' picks whichever was saved last. Returns 'loaded' or 'saved'. */
async function attach(h, prefer) {
  const { j, mtime } = await readFile(h);
  const load = j && (prefer === 'file' || (prefer === 'newest' && (j.savedAt || 0) > lastSavedAt()));
  if (load) applyPersisted(j);
  FS.handle = h;
  FS.name = h.name;
  FS.mtime = mtime;
  await storeHandle(h).catch(() => {});
  setStatus('ready');
  if (!load) {
    queueWrite(persistedState());
    await writing;
  }
  return load ? 'loaded' : 'saved';
}
const canWrite = async h => (await h.queryPermission({ mode: 'readwrite' })) === 'granted' || (await h.requestPermission({ mode: 'readwrite' })) === 'granted';

/* the pickers and permission requests must run from a click */
export async function createDataFile() {
  const h = await window.showSaveFilePicker({ ...PICK, suggestedName: 'gr8r-data.json' });
  return attach(h, 'local');
}
export async function openDataFile() {
  const [h] = await window.showOpenFilePicker(PICK);
  if (!(await canWrite(h))) throw new Error('Gr8r needs permission to save changes to this file.');
  return attach(h, 'file');
}
export async function reconnectDataFile() {
  if (!(await canWrite(FS.handle))) return null;
  return attach(FS.handle, 'newest');
}
export async function disconnectDataFile() {
  FS.handle = null;
  FS.name = '';
  await storeHandle(null).catch(() => {});
  setStatus('off');
}

/* on boot: reattach silently if the browser kept the permission, else wait for a click */
export async function restoreDataFile() {
  if (!fileSupported) return null;
  const h = await loadHandle().catch(() => null);
  if (!h) return null;
  FS.handle = h;
  FS.name = h.name;
  if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    setStatus('locked');
    return null;
  }
  return attach(h, 'newest').catch(e => (setStatus('error', e.message), null));
}

/* when the tab comes back, pick up edits made to the file elsewhere (e.g. synced from another Mac) */
export async function refreshFromFile() {
  if (FS.status !== 'ready' || writing) return false;
  try {
    const f = await FS.handle.getFile();
    if (f.lastModified === FS.mtime) return false;
    const { j, mtime } = await readFile(FS.handle);
    FS.mtime = mtime;
    if (!j || (j.savedAt || 0) <= lastSavedAt()) return false;
    applyPersisted(j);
    return true;
  } catch (e) {
    setStatus('error', e.name === 'NotFoundError' ? `${FS.name} was moved or deleted.` : e.message);
    return false;
  }
}
