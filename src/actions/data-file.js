/* =====================================================================
   ACTIONS · DATA FILE: connect, reconnect, disconnect the JSON data file
   ===================================================================== */
import {
  FS,
  createDataFile,
  disconnectDataFile,
  fileSupported,
  onFileStatus,
  openDataFile,
  reconnectDataFile,
  refreshFromFile,
  restoreDataFile,
} from '../core/file-store.js';
import { toast } from '../ui/toast.js';
import { go, render } from '../shell/render.js';
import { A, confirmDlg } from './actions.js';

/* run a file action from a click; a closed picker is not an error */
async function run(fn, done) {
  try {
    const r = await fn();
    if (r) done?.(r);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message || "Couldn't open the data file.", { kind: 'err', ms: 6000 });
  }
  render();
}
const loadedMsg = r => (r === 'loaded' ? `Loaded your workspace from ${FS.name}` : `Saving to ${FS.name}`);

A.createDataFile = () => run(createDataFile, r => toast(loadedMsg(r)));
A.openDataFile = () =>
  confirmDlg({
    title: 'Open an existing data file?',
    body: 'The workspace in this browser will be replaced by the contents of the file you choose.',
    ok: 'Choose file',
    run: () => run(openDataFile, r => toast(loadedMsg(r))),
  });
A.reconnectDataFile = () => run(reconnectDataFile, r => toast(loadedMsg(r)));
A.disconnectDataFile = () =>
  confirmDlg({
    title: `Stop saving to ${FS.name}?`,
    body: 'Your workspace stays in this browser. The file keeps its last saved copy.',
    ok: 'Stop saving',
    run: () => run(disconnectDataFile).then(() => toast('Saving to this browser only', { kind: 'info' })),
  });

/* status changes after boot re-render; a lost connection gets one toast */
let booted = false;
onFileStatus(fs => {
  if (!booted) return;
  if (fs.status === 'error')
    toast(`Changes aren't reaching your data file. ${fs.error}`, { kind: 'err', ms: 8000, action: 'Fix', onAction: () => go('settings', { sec: 'data' }) });
  render();
});

if (fileSupported) {
  restoreDataFile().then(r => {
    booted = true;
    if (r === 'loaded') render();
    if (FS.status === 'locked')
      toast(`Allow access to ${FS.name} to keep saving to it.`, { kind: 'info', ms: 15000, action: 'Allow', onAction: A.reconnectDataFile });
    if (FS.status === 'error') toast(FS.error, { kind: 'err', ms: 8000 });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      refreshFromFile().then(changed => {
        if (changed) {
          render();
          toast(`Updated from ${FS.name}`, { kind: 'info', ms: 2500 });
        }
      });
  });
}
