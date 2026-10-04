// On-screen HTML on top of the canvas: the distance display and the
// game-over overlay.

const hud = document.createElement('div');
hud.id = 'hud';
// The shield icon: a ring around it drains while the shield is up and
// refills during the cooldown. 'ready' / 'raised' / 'cooldown' set its look.
const SHIELD_ICON = `<svg viewBox="0 0 44 44" aria-hidden="true">
  <circle class="track" cx="22" cy="22" r="20" />
  <circle class="ring" cx="22" cy="22" r="20" pathLength="100" />
  <rect class="scutum" x="14" y="9" width="16" height="26" rx="3" />
  <path class="trim" d="M22 11v22M16 22h12" />
  <circle class="boss" cx="22" cy="22" r="2.6" />
</svg>`;
// Escape mode: progress from Pompeii to the sea. The marker is a small
// scutum; the right end has a wave.
const WAVE = '<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M1 8c3-4 5-4 7 0s5 4 7 0 5-4 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const JOURNEY_BAR = `<div class="journey" hidden>
  <span class="from">Pompeii</span>
  <div class="track"><div class="fill"></div><div class="marker"></div></div>
  <span class="to">${WAVE}the sea</span>
</div>`;
hud.innerHTML = `<div class="distance">0 m</div>${JOURNEY_BAR}<div class="route-change" aria-live="polite"></div><div class="best"></div><div class="shield" data-state="ready">${SHIELD_ICON}</div>`;
document.body.appendChild(hud);
const shieldIcon = hud.querySelector('.shield');
const shieldRing = shieldIcon.querySelector('.ring');
let shownShield = '';

// remaining: 1 → 0 through the current state.
export function updateShield(state, remaining) {
  const fill = state === 'cooldown' ? 1 - remaining : state === 'raised' ? remaining : 1;
  const key = `${state}${Math.round(fill * 50)}`;
  if (key === shownShield) return; // only touch the page when something shows a change
  shownShield = key;
  shieldIcon.dataset.state = state;
  shieldRing.style.strokeDashoffset = String(100 - fill * 100);
}

// ---- Compass, top left: Vesuvius and the sea around a ring, up = ahead ----
const compass = document.createElement('div');
compass.id = 'compass';
compass.setAttribute('role', 'img');
compass.innerHTML = `<svg viewBox="-30 -30 60 60" aria-hidden="true">
  <circle class="dial" r="27" />
  <path class="ahead" d="M0 -29 L-3.5 -23 H3.5 Z" />
  <g class="vesuvius"><path d="M-7 4 L-2 -4 H2 L7 4 Z" /><circle class="plume" cx="0" cy="-7" r="2.4" /></g>
  <g class="sea"><path d="M-7 1 q1.75 -3 3.5 0 t3.5 0 t3.5 0 t3.5 0" /><path d="M-7 5 q1.75 -3 3.5 0 t3.5 0 t3.5 0 t3.5 0" /></g>
</svg>`;
document.body.appendChild(compass);
const compassMarks = { vesuvius: compass.querySelector('.vesuvius'), sea: compass.querySelector('.sea') };
let shownCompass = '';

// bearings: { vesuvius, sea } in radians, clockwise from straight ahead.
export function updateCompass(bearings) {
  const key = `${bearings.vesuvius.toFixed(2)},${bearings.sea.toFixed(2)}`;
  if (key === shownCompass) return; // only touch the page when it changes
  shownCompass = key;
  for (const [name, mark] of Object.entries(compassMarks)) {
    const b = bearings[name];
    mark.setAttribute('transform', `translate(${(Math.sin(b) * 17).toFixed(2)} ${(-Math.cos(b) * 17).toFixed(2)})`);
  }
  const ahead = (b) => Math.round((((b * 180) / Math.PI) % 360 + 540) % 360 - 180); // −180…180
  compass.setAttribute('aria-label', `Compass: Vesuvius ${ahead(bearings.vesuvius)}°, the sea ${ahead(bearings.sea)}° from straight ahead`);
}

// A short message under the distance bar that fades out. kind sets its colour.
const notice = hud.querySelector('.route-change');
function showNotice(text, kind) {
  notice.textContent = text;
  notice.dataset.kind = kind;
  notice.classList.remove('show');
  void notice.offsetWidth; // restart the fade animation
  notice.classList.add('show');
}

// Escape mode: a turn moved the sea nearer (metres < 0) or further away.
export function showRouteChange(metres) {
  if (!metres) return;
  showNotice(metres < 0 ? `−${-metres} m · towards the sea` : `+${metres} m · away from the sea`, metres < 0 ? 'nearer' : 'further');
}

// Mute button, top right. data-control keeps its taps away from the swipe
// and tap handling in input.js.
const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const muteButton = document.createElement('button');
muteButton.id = 'mute';
muteButton.type = 'button';
muteButton.dataset.control = '';
document.body.appendChild(muteButton);

// ---- Start screen ----
const start = document.createElement('div');
start.id = 'start';
start.innerHTML = `
  <h1>Escape Pompeii</h1>
  <p class="tagline">Pompeii, 79 AD. Vesuvius is erupting. Run for the harbour.</p>
  <p class="controls">Swipe, or use the arrow keys / WASD:<br />left and right to change lane, up to jump, down to slide.<br />Tap or press E to raise your shield.</p>
  <p class="sound"></p>
  <div class="modes" data-control hidden>
    <button type="button" data-mode="escape"><b>Escape to the sea</b><small>1.6 km · press 1</small></button>
    <button type="button" data-mode="endless"><b>Endless</b><small>as far as you can · press 2</small></button>
  </div>
  <p class="hint">Tap or press Space to start</p>
`;
document.body.appendChild(start);
const startModes = start.querySelector('.modes');
const startHint = start.querySelector('.hint');

// Once Endless is unlocked the start screen offers both modes.
// onPick(mode) runs when a mode button is tapped.
export function setupStartModes(onPick) {
  for (const button of startModes.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      button.blur(); // keep keys going to the game
      onPick(button.dataset.mode);
    });
  }
}

// unlocked: show the mode buttons. length: the journey (for its label).
export function showStart(unlocked, length) {
  startModes.hidden = !unlocked;
  startModes.querySelector('[data-mode="escape"] small').textContent = `${(length / 1000).toLocaleString('en-US')} km · press 1`;
  startHint.textContent = unlocked ? 'Choose a run' : 'Tap or press Space to start';
  start.hidden = false;
}

export function updateStartSound(muted) {
  start.querySelector('.sound').textContent = muted
    ? 'Sound is off. Press M or tap the speaker to turn it on.'
    : 'Sound comes on with your first tap.';
}

export function hideStart() {
  start.hidden = true;
}

// ---- Settings: Music and Effects volume ----
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const settingsButton = document.createElement('button');
settingsButton.id = 'settings-button';
settingsButton.type = 'button';
settingsButton.dataset.control = '';
settingsButton.innerHTML = GEAR;
settingsButton.setAttribute('aria-label', 'Sound settings');
settingsButton.title = 'Sound settings';
document.body.appendChild(settingsButton);

const settings = document.createElement('div');
settings.id = 'settings';
settings.hidden = true;
settings.dataset.control = '';
settings.setAttribute('role', 'dialog');
settings.setAttribute('aria-labelledby', 'settings-title');
settings.innerHTML = `
  <h2 id="settings-title">Sound</h2>
  <label for="volume-music">Music <output for="volume-music"></output></label>
  <input id="volume-music" type="range" min="0" max="100" step="5" />
  <label for="volume-effects">Effects <output for="volume-effects"></output></label>
  <input id="volume-effects" type="range" min="0" max="100" step="5" />
  <p class="note">Effects: footsteps, crashes, the rumble and the surge.</p>
  <button type="button" class="done">Done</button>
`;
document.body.appendChild(settings);

// levels: { music, effects } 0–1. onChange(levels) on every slider move;
// onOpenChange(open) when the panel opens or closes (the game pauses).
export function setupSettings(levels, { onChange, onOpenChange }) {
  const sliders = {
    music: settings.querySelector('#volume-music'),
    effects: settings.querySelector('#volume-effects'),
  };
  for (const [name, slider] of Object.entries(sliders)) {
    const output = settings.querySelector(`output[for="${slider.id}"]`);
    const show = () => (output.textContent = `${slider.value}%`);
    slider.value = Math.round(levels[name] * 100);
    show();
    slider.addEventListener('input', () => {
      show();
      onChange({ [name]: slider.value / 100 });
    });
  }

  const setOpen = (open) => {
    settings.hidden = !open;
    if (open) sliders.music.focus();
    else document.activeElement?.blur(); // keys go back to the game
    onOpenChange(open);
  };
  settingsButton.addEventListener('click', () => setOpen(settings.hidden));
  settings.querySelector('.done').addEventListener('click', () => setOpen(false));
  settings.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

export function onMuteButton(handler) {
  muteButton.addEventListener('click', (event) => {
    muteButton.blur(); // so Space/arrow keys keep going to the game
    handler(event);
  });
}

export function showMuted(muted) {
  muteButton.innerHTML = muted ? SPEAKER_OFF : SPEAKER_ON;
  muteButton.setAttribute('aria-label', muted ? 'Turn sound on (M)' : 'Mute sound (M)');
  muteButton.title = muteButton.getAttribute('aria-label');
}

// Orange glow at the screen edges: the surge behind you.
const edgeGlow = document.createElement('div');
edgeGlow.id = 'surge-glow';
document.body.appendChild(edgeGlow);

// Full-screen ash that fades in when the surge catches the player.
const ashFade = document.createElement('div');
ashFade.id = 'ash-fade';
document.body.appendChild(ashFade);

const overlay = document.createElement('div');
overlay.id = 'game-over';
overlay.hidden = true;
overlay.innerHTML = `
  <h1>Game over</h1>
  <p class="reason"></p>
  <p class="distance"></p>
  <p class="best"></p>
  <p class="hint">Tap or press R to run again</p>
  <button type="button" class="menu" data-control>Menu</button>
`;
document.body.appendChild(overlay);

const hudDistance = hud.querySelector('.distance');
const hudBest = hud.querySelector('.best');
let shownDistance = -1;

// Called every frame, but only touches the page when the number changes:
// updating the page is much slower than checking a number.
const journeyBar = hud.querySelector('.journey');
const journeyFill = journeyBar.querySelector('.fill');
const journeyMarker = journeyBar.querySelector('.marker');
let journeyLength = null;
const metres = (m) => m.toLocaleString('en-US'); // 1600 → "1,600"

// length: the journey in metres (Escape mode), or null (Endless: no bar).
export function setJourney(length) {
  journeyLength = length;
  journeyBar.hidden = !length;
  shownDistance = -1;
}

export function updateDistance(distance) {
  if (distance === shownDistance) return;
  shownDistance = distance;
  if (!journeyLength) {
    hudDistance.textContent = `${distance} m`;
    return;
  }
  const shown = Math.min(distance, journeyLength);
  // The distance run stays big; the journey's length is small beside it.
  hudDistance.innerHTML = `${metres(shown)}<small> / ${metres(journeyLength)} m</small>`;
  // transform (not width/left) so the browser can move it without re-layout
  const progress = shown / journeyLength;
  journeyFill.style.transform = `scaleX(${progress})`;
  journeyMarker.style.transform = `translateX(${(progress * 100).toFixed(2)}cqw)`;
}

// While the player's model downloads, the distance display says so.
export function setLoading(loading) {
  hudDistance.textContent = loading ? 'Loading…' : '0 m';
  shownDistance = loading ? -1 : 0;
}

export function showBest(best) {
  hudBest.textContent = best > 0 ? `Best ${best} m` : '';
}

// Both take 0–1. Setting opacity is cheap: the browser blends these layers
// on the GPU without redrawing the page.
export function setEdgeGlow(amount) {
  edgeGlow.style.opacity = amount.toFixed(3);
}

export function setAshFade(amount) {
  ashFade.style.opacity = amount.toFixed(3);
}

// journey: { length, bestTime } in Escape mode (shows how far along you
// got instead of the best distance), or null in Endless mode.
export function showGameOver(distance, best, isNewBest, reason = '', journey = null) {
  overlay.querySelector('.reason').textContent = reason;
  overlay.querySelector('.distance').textContent = `You ran ${distance.toLocaleString('en-US')} m`;
  if (journey) {
    const percent = Math.min(99, Math.floor((distance / journey.length) * 100));
    overlay.querySelector('.best').textContent =
      `${percent}% of the way to the sea` + (journey.bestTime ? ` · Best time ${formatTime(journey.bestTime)}` : '');
  } else {
    overlay.querySelector('.best').textContent = isNewBest ? 'New best!' : `Best: ${best} m`;
  }
  overlay.hidden = false;
}

// The Menu button on the game-over and end screens (shown once Endless is
// unlocked, when there is a choice to go back to).
export function setupMenuButtons(onMenu) {
  for (const button of [overlay, finish].map((o) => o.querySelector('.menu'))) {
    button.addEventListener('click', () => {
      button.blur();
      onMenu();
    });
  }
}

export function showMenuButtons(visible) {
  for (const o of [overlay, finish]) o.querySelector('.menu').hidden = !visible;
}

export function hideGameOver() {
  overlay.hidden = true;
  finish.hidden = true;
}

// 87.4 → "1:27.4"
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

// ---- End screen: reached the sea (Escape mode) ----
const finish = document.createElement('div');
finish.id = 'finish';
finish.hidden = true;
finish.innerHTML = `
  <h1>You reached the sea</h1>
  <dl class="stats">
    <dt>Distance</dt><dd class="distance"></dd>
    <dt>Time</dt><dd class="time"></dd>
    <dt>Artifacts</dt><dd class="artifacts"></dd>
    <dt>People saved</dt><dd class="saved"></dd>
    <dt>Best time</dt><dd class="best"></dd>
  </dl>
  <p class="unlocked" hidden>Endless mode unlocked</p>
  <p class="fact"></p>
  <p class="hint">Tap or press R to run again</p>
  <button type="button" class="menu" data-control>Menu</button>
`;
document.body.appendChild(finish);

export function showFinish({ distance, time, artifacts, saved, bestTime, isNewBest, unlocked, fact }) {
  finish.querySelector('.distance').textContent = `${distance.toLocaleString('en-US')} m`;
  finish.querySelector('.time').textContent = formatTime(time);
  finish.querySelector('.artifacts').textContent = String(artifacts);
  finish.querySelector('.saved').textContent = String(saved);
  finish.querySelector('.best').textContent = isNewBest ? `${formatTime(bestTime)}, new best!` : formatTime(bestTime);
  finish.querySelector('.unlocked').hidden = !unlocked;
  finish.querySelector('.fact').textContent = fact;
  finish.hidden = false;
}
