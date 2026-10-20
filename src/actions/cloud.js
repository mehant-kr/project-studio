/* =====================================================================
   ACTIONS · CLOUD SYNC: sign in or create an account, choose a starting
   workspace, sync now, sign out (Settings → Data & storage)
   ===================================================================== */
import { $ } from '../core/utils.js';
import { S } from '../core/store.js';
import { CLOUD, chooseStart, createAccount, errorText, signIn, signOut, syncNow } from '../core/cloud.js';
import { toast } from '../ui/toast.js';
import { render } from '../shell/render.js';
import { A, confirmDlg } from './actions.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* run a cloud call with the buttons disabled; errors show under the form */
async function busy(fn) {
  S.ui.cloudBusy = true;
  S.ui.errors.cloud = '';
  render();
  try {
    await fn();
  } catch (e) {
    S.ui.errors.cloud = errorText(e);
  }
  S.ui.cloudBusy = false;
  render();
}

/* read and check the form; null (with the error shown) when it isn't filled in properly */
function credentials(isNew) {
  const email = $('#cloud-email')?.value.trim() || '';
  const password = $('#cloud-password')?.value || '';
  const err = !EMAIL_RE.test(email)
    ? 'Enter a valid email address'
    : password.length < (isNew ? 8 : 1)
      ? isNew
        ? 'Use at least 8 characters for the password'
        : 'Enter your password'
      : '';
  if (err) {
    CLOUD.email = email;
    S.ui.errors.cloud = err;
    render();
    return null;
  }
  return { email, password };
}
const signedIn = () => CLOUD.status === 'ready' && toast(`Syncing as ${CLOUD.email}`);
A.cloudSignIn = () => {
  const c = credentials(false);
  if (c) busy(() => signIn(c.email, c.password).then(signedIn));
};
A.cloudCreateAccount = () => {
  const c = credentials(true);
  if (c) busy(() => createAccount(c.email, c.password).then(signedIn));
};
A.cloudChoose = el => {
  const mode = el.dataset.v;
  const go = () =>
    busy(async () => {
      await chooseStart(mode);
      if (CLOUD.status === 'ready') toast(mode === 'cloud' ? 'Loaded your cloud workspace' : 'Uploaded this workspace to the cloud');
    });
  if (mode === 'cloud') go();
  else
    confirmDlg({
      title: 'Replace the cloud workspace?',
      body: `The workspace in your cloud account (${CLOUD.remoteCount} records) will be replaced by the one on this device, on every signed-in device. This can't be undone.`,
      ok: 'Replace cloud workspace',
      danger: true,
      run: go,
    });
};
A.cloudSyncNow = () => busy(syncNow);
A.cloudSignOut = () =>
  confirmDlg({
    title: 'Sign out of cloud sync?',
    body: 'Your workspace stays on this device. Changes stop syncing until you sign in again.',
    ok: 'Sign out',
    run: () => busy(signOut).then(() => toast('Signed out of cloud sync', { kind: 'info' })),
  });
