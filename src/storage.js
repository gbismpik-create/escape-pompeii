// Best score, saved in the browser. localStorage can be missing or throw
// (private browsing, storage disabled, quota full), so every access is
// wrapped: the game still works, it just won't remember the score.

const BEST_KEY = 'escape-pompeii.best';

export function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(distance) {
  try {
    localStorage.setItem(BEST_KEY, String(distance));
  } catch {
    // Not saved; nothing else to do.
  }
}
