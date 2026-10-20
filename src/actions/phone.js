/* =====================================================================
   ACTIONS · PHONE SCREENS (pages/phone.js): the project search box, and
   switching layouts when the window crosses the phone width
   ===================================================================== */
import { S } from '../core/store.js';
import { render } from '../shell/render.js';
import { IN } from './actions.js';

IN.mProjQ = el => {
  S.ui.mProjQ = el.value;
  render();
};
try {
  matchMedia('(max-width: 640px)').addEventListener('change', () => render());
} catch {
  /* not supported here; the layout updates on the next render */
}
