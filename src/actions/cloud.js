/* =====================================================================
   ACTIONS · CLOUD SYNC: sign in with an emailed code, choose a starting
   workspace, sync now, sign out (Settings → Data & storage)
   ===================================================================== */
import { $ } from '../core/utils.js';
import { S } from '../core/store.js';
import { CLOUD, changeEmail, chooseStart, errorText, sendCode, signOut, syncNow, verifyCode } from '../core/cloud.js';
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

A.cloudSendCode = () => {
  const email = $('#cloud-email')?.value.trim() || '';
  if (!EMAIL_RE.test(email)) {
    S.ui.errors.cloud = 'Enter a valid email address';
    render();
    return;
  }
  busy(() => sendCode(email));
};
A.cloudVerify = () => {
  const code = $('#cloud-code')?.value.trim() || '';
  if (!/^\d{6}$/.test(code)) {
    S.ui.errors.cloud = 'Enter the 6-digit code from the email';
    render();
    return;
  }
  busy(async () => {
    await verifyCode(code);
    if (CLOUD.status === 'ready') toast(`Syncing as ${CLOUD.email}`);
  });
};
A.cloudChangeEmail = () => {
  S.ui.errors.cloud = '';
  changeEmail();
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
