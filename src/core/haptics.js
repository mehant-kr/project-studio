/* ---------- haptic feedback ----------
   A no-op in the browser. The native iPhone app plugs in real haptics with
   setHaptics() at start-up. kind: 'success' (a task completed), 'light'
   (a small confirmation: snooze, drop, crossing a swipe threshold) or
   'medium' (something lifted under the finger). */
let impl = null;
export const setHaptics = fn => (impl = fn);
export function haptic(kind = 'light') {
  try {
    impl?.(kind);
  } catch {
    /* haptics are a nicety; never let them break an action */
  }
}
