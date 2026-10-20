/* ---------- workspace state <-> records ----------
   Shared by the local SQLite database (db.js) and cloud sync (cloud.js).
   Every list of records in the workspace (tasks, projects, comments, …) becomes
   one row per record; everything else is a row under kind '_meta'.
   A row is [kind, id, doc] with doc as a JSON string. */
export const isList = v =>
  Array.isArray(v) && v.every(x => x && typeof x === 'object' && typeof x.id === 'string') && new Set(v.map(x => x.id)).size === v.length;
export const key = (kind, id) => kind + '\u001f' + id;
export function toRows(j) {
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
/* list: [{ kind, id, doc }] with doc as a JSON string; records missing from their
   order row are appended, so nothing is lost when two devices add at once */
export function fromRows(list) {
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
