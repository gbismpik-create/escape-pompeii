// Best score and sound choices, saved in the browser. localStorage can be missing or throw
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

// The player's Music and Effects volume levels (0–1) from the settings panel.
const VOLUMES_KEY = 'escape-pompeii.volumes';

export function loadVolumes() {
  const defaults = { music: 1, effects: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUMES_KEY));
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

export function saveVolumes(volumes) {
  try {
    localStorage.setItem(VOLUMES_KEY, JSON.stringify(volumes));
  } catch {
    // Not saved; the defaults come back next time.
  }
}
