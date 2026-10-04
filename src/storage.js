// Best score and the mute choice, saved in the browser. localStorage can be missing or throw
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

const MUTED_KEY = 'escape-pompeii.muted';

export function loadMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted) {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Not saved; the game starts with sound next time.
  }
}
