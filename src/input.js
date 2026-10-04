// Turns raw keyboard events into game actions ('left', 'right', 'jump', 'down').
// Actions are queued so a quick tap is never missed between frames.

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
};

const queue = [];

window.addEventListener('keydown', (event) => {
  const action = KEY_ACTIONS[event.code];
  if (!action || event.repeat) return; // ignore auto-repeat when a key is held
  event.preventDefault();
  queue.push(action);
});

// Returns all actions since the last call, then clears the queue.
export function consumeActions() {
  return queue.splice(0);
}
