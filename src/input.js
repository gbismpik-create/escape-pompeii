// Turns raw keyboard, touch and mouse events into game actions
// ('left', 'right', 'jump', 'down', 'restart', 'tap').
// Actions are queued so a quick tap is never missed between frames.
import { INPUT } from './config.js';

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyR: 'restart',
};

const queue = [];

window.addEventListener('keydown', (event) => {
  const action = KEY_ACTIONS[event.code];
  if (!action || event.repeat) return; // ignore auto-repeat when a key is held
  event.preventDefault();
  queue.push(action);
});

// --- Touch swipes ---
// The move fires as soon as the finger has travelled far enough, without
// waiting for it to lift, which makes swipes feel instant. One action per swipe.
let swipe = null; // { id, startX, startY, done }

window.addEventListener(
  'touchstart',
  (event) => {
    event.preventDefault(); // stop scrolling, zooming and the delayed fake mouse click
    if (swipe) return; // only follow the first finger
    const touch = event.changedTouches[0];
    swipe = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY, done: false };
  },
  { passive: false }, // needed, or the browser ignores preventDefault()
);

window.addEventListener(
  'touchmove',
  (event) => {
    event.preventDefault();
    const touch = findTouch(event.changedTouches);
    if (!touch || swipe.done) return;

    const dx = touch.clientX - swipe.startX;
    const dy = touch.clientY - swipe.startY;
    if (Math.hypot(dx, dy) < INPUT.minSwipeDistance) return;

    // Whichever direction moved more wins. Screen y grows downwards.
    if (Math.abs(dx) > Math.abs(dy)) queue.push(dx > 0 ? 'right' : 'left');
    else queue.push(dy > 0 ? 'down' : 'jump');
    swipe.done = true;
  },
  { passive: false },
);

// A touch that ends without becoming a swipe is a tap.
window.addEventListener('touchend', (event) => {
  if (!findTouch(event.changedTouches)) return;
  if (!swipe.done) queue.push('tap');
  swipe = null;
});
window.addEventListener('touchcancel', (event) => {
  if (findTouch(event.changedTouches)) swipe = null;
});

// A mouse click counts as a tap too, for testing on a computer.
window.addEventListener('mousedown', () => queue.push('tap'));

function findTouch(touches) {
  if (!swipe) return null;
  for (const touch of touches) if (touch.identifier === swipe.id) return touch;
  return null;
}

// iOS Safari ignores user-scalable=no; this blocks its pinch-zoom gesture.
document.addEventListener('gesturestart', (event) => event.preventDefault());

// Returns all actions since the last call, then clears the queue.
export function consumeActions() {
  return queue.splice(0);
}
