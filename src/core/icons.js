/* ---------- icons: inlined Lucide subset (src/00-icons.js), rendered to inline svg ---------- */
import { ICONS } from 'virtual:icons';
import { esc } from './utils.js';

export const _icCache = {};
export function ic(name, size = 16, cls = '') {
  const k = name + '|' + size + '|' + cls;
  if (_icCache[k]) return _icCache[k];
  const inner = ICONS[name] || '<rect x="5" y="5" width="14" height="14" rx="3"/>';
  return (_icCache[k] =
    `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
}
/* Pindrop brand: the glyph (public/pindrop-mark.png) is drawn as a CSS mask, so in the logo it follows the
   theme's text colour; the workspace tile is the white glyph on a black tile, like the app icon. */
export const LOGO = (h = 22) =>
  `<span class="logo" role="img" aria-label="Pindrop Studio" style="--h:${h}px"><span class="logo-glyph"></span><span class="logo-name">Pindrop Studio</span></span>`;
export const MARK = (px = 22) => `<span class="mark" style="width:${px}px;height:${px}px" aria-hidden="true"><span class="logo-glyph"></span></span>`;
export function wsLogo(w, px = 22) {
  return w && w.brand
    ? `<span class="ws-logo brand" style="width:${px}px;height:${px}px">${MARK(px)}</span>`
    : `<span class="ws-logo" style="--c:${w.c};width:${px}px;height:${px}px;font-size:${Math.max(9, Math.round(px * 0.46))}px">${esc(w.name[0])}</span>`;
}
