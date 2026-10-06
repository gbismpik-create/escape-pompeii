// On-screen HTML on top of the canvas: the distance display and the
// game-over overlay.

import { ROUTE_MAP, COINS, POWERUPS } from './config.js';

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

// The district's name, large in the middle of the screen for a moment
// when the runner enters it.
const districtTitle = document.createElement('div');
districtTitle.id = 'district-title';
districtTitle.setAttribute('aria-live', 'polite');
document.body.appendChild(districtTitle);

export function showDistrict(name, seconds) {
  districtTitle.textContent = name;
  districtTitle.style.animationDuration = `${seconds}s`;
  districtTitle.classList.remove('show');
  void districtTitle.offsetWidth; // restart the fade
  districtTitle.classList.add('show');
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

// ---- Coins: counters top right, under the buttons ----
// A small coin: a disc with a rim and a head in profile, silver or gold.
export function coinIcon(type) {
  return `<svg class="coin-icon ${type}" viewBox="0 0 20 20" aria-hidden="true">
  <circle cx="10" cy="10" r="9" class="face" /><circle cx="10" cy="10" r="7.2" class="rim" />
  <path class="head" d="M8 5.5c2.2-.9 4.4.4 4.6 2.6l1 1.3-1 .4.2 1.6c0 .9-.8 1.3-1.8 1.2l-.2 2.2H7.4c.6-1.2.3-2.2-.6-3.2-1.6-1.9-.9-5.2 1.2-6.1z" />
</svg>`;
}
const coinCounter = document.createElement('div');
coinCounter.id = 'coins';
coinCounter.innerHTML = ['silver', 'gold'].map((type) => `<div class="count ${type}">${coinIcon(type)}<span>0</span></div>`).join('');
document.body.appendChild(coinCounter);
const counters = Object.fromEntries(['silver', 'gold'].map((type) => {
  const el = coinCounter.querySelector(`.${type}`);
  return [type, { el, icon: el.querySelector('svg'), number: el.querySelector('span'), shown: 0 }];
}));

// The counters: shown numbers (a coin in flight counts when it lands).
export function setCoins(silver, gold) {
  for (const [type, n] of [['silver', silver], ['gold', gold]]) {
    counters[type].shown = n;
    counters[type].number.textContent = String(n);
  }
}
function bump(type) {
  const c = counters[type];
  c.number.textContent = String(++c.shown);
  c.el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
}

// A picked-up coin flies from where it was (x, y: screen pixels) into its
// counter, and a spark flashes where it was taken. Small pooled elements,
// moved with the Web Animations API: only transform and opacity change, so
// the browser animates them without laying the page out again.
const flyers = [];
function flyer() {
  let f = flyers.find((e) => !e.busy);
  if (!f) {
    f = { coin: document.createElement('div'), spark: document.createElement('div'), busy: false };
    f.coin.className = 'coin-flyer';
    f.spark.className = 'coin-spark';
    document.body.append(f.spark, f.coin);
    flyers.push(f);
  }
  return f;
}
export function flyCoin(type, x, y) {
  const f = flyer(), target = counters[type].icon.getBoundingClientRect();
  f.busy = true;
  f.coin.innerHTML = coinIcon(type);
  f.spark.style.setProperty('--spark', COINS.sparkColor[type]);
  const ms = COINS.flyTime * 1000;
  const tx = target.left + target.width / 2 - x, ty = target.top + target.height / 2 - y;
  f.spark.animate([
    { transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 1 },
    { transform: `translate(${x}px, ${y}px) scale(1.4)`, opacity: 0 },
  ], { duration: 260, easing: 'ease-out' });
  const flight = f.coin.animate([
    { transform: `translate(${x}px, ${y}px) scale(1.3)`, opacity: 1 },
    { transform: `translate(${x + tx}px, ${y + ty}px) scale(0.8)`, opacity: 1 },
  ], { duration: ms, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' }); // speeds up into the counter
  flight.onfinish = () => {
    f.busy = false;
    bump(type);
  };
}

// ---- Power-ups: an icon for each one working, under the coin counters,
// with a ring that drains as it runs out (the aegis stays full) ----
const POWERUP_ICONS = {
  // Mercury's purse: a leather pouch with little wings
  magnet: `<path class="wing" d="M8 17c-4-1-6-4-6-7 2 2 4 2 6 3zM28 17c4-1 6-4 6-7-2 2-4 2-6 3z"/><path class="leather" d="M14 11h8l-1 3c4 2 6 6 5 10-1 4-5 6-8 6s-7-2-8-6c-1-4 1-8 5-10z"/><path class="gold" d="M13.5 13.5h9" stroke-width="2"/>`,
  // Fortuna's favour: a gilded wheel
  double: `<circle class="gold-line" cx="18" cy="18" r="10" stroke-width="2.6"/><path class="gold-line" d="M18 8v20M8 18h20M11 11l14 14M25 11 11 25" stroke-width="1.6"/><circle class="gold" cx="18" cy="18" r="3"/>`,
  // Aegis of Minerva: a gold shield with the Gorgon's face
  aegis: `<circle class="gold" cx="18" cy="18" r="11"/><circle class="gold-dark" cx="18" cy="18" r="4.2"/><path class="gold-dark-line" d="M18 11.5v-3M23 13l2.4-2.4M24.5 18h3M13 13l-2.4-2.4M11.5 18h-3M14 23l-2 2.4M22 23l2 2.4" stroke-width="1.6"/>`,
  // Wings of Pegasus: two white wings
  wings: `<path class="wing" d="M17 20C13 13 7 10 3 10c2 3 1 6 3 8-1 1 0 3 2 3 1 2 3 3 5 2 2 1 3 0 4-3zM19 20c4-7 10-10 14-10-2 3-1 6-3 8 1 1 0 3-2 3-1 2-3 3-5 2-2 1-3 0-4-3z"/><circle class="gold" cx="18" cy="20" r="2"/>`,
};
const powerupBar = document.createElement('div');
powerupBar.id = 'powerups';
powerupBar.innerHTML = Object.entries(POWERUP_ICONS).map(([type, art]) => `<div class="powerup" data-type="${type}" hidden><svg viewBox="0 0 36 36" aria-hidden="true">
  <circle class="track" cx="18" cy="18" r="16.5"/><circle class="ring" cx="18" cy="18" r="16.5" pathLength="100"/>${art}</svg></div>`).join('');
coinCounter.appendChild(powerupBar);
const powerupIcons = Object.fromEntries([...powerupBar.children].map((el) => [el.dataset.type, { el, ring: el.querySelector('.ring'), shown: '' }]));

// list: [{ type, fraction }] of the power-ups working now (fraction 1 → 0).
export function updatePowerups(list) {
  for (const [type, icon] of Object.entries(powerupIcons)) {
    const on = list.find((p) => p.type === type);
    const key = on ? String(Math.round(on.fraction * 100)) : 'off';
    if (key === icon.shown) continue; // only touch the page when it changes
    if (icon.shown === 'off' || icon.shown === '') icon.el.animate?.([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    icon.shown = key;
    icon.el.hidden = !on;
    if (on) icon.ring.style.strokeDashoffset = String(100 - on.fraction * 100);
  }
}

// The aegis shatters: a gold flash over the screen and shards flying out
// from the runner (x, y: screen pixels).
const aegisFlash = document.createElement('div');
aegisFlash.id = 'aegis-flash';
document.body.appendChild(aegisFlash);
export function shatterAegis(x, y) {
  aegisFlash.style.background = `radial-gradient(circle at ${x}px ${y}px, ${POWERUPS.aegis.flashColor}cc 0%, ${POWERUPS.aegis.flashColor}55 30%, transparent 70%)`;
  aegisFlash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  for (let i = 0; i < 14; i++) {
    const shard = document.createElement('div');
    shard.className = 'aegis-shard';
    document.body.appendChild(shard);
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4, r = 90 + Math.random() * 110;
    shard.animate([
      { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)`, opacity: 1 },
      { transform: `translate(${x + Math.cos(a) * r}px, ${y + Math.sin(a) * r}px) rotate(${(Math.random() - 0.5) * 720}deg) scale(0.4)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 250, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' }).onfinish = () => shard.remove();
  }
}

// The coins line on the game-over and end screens.
const coinsLine = (silver, gold, score) =>
  `<span class="pair">${coinIcon('silver')}${silver}</span><span class="pair">${coinIcon('gold')}${gold}</span><span class="score">Score ${score.toLocaleString('en-US')}</span>`;

const overlay = document.createElement('div');
overlay.id = 'game-over';
overlay.hidden = true;
overlay.innerHTML = `
  <h1>Game over</h1>
  <p class="reason"></p>
  <p class="distance"></p>
  <p class="coins"></p>
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
  hudBest.textContent = best > 0 ? `Best score ${best.toLocaleString('en-US')}` : '';
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
// got instead of the best score), or null in Endless mode.
// coins: { silver, gold, score } this run.
export function showGameOver(distance, best, isNewBest, reason = '', journey = null, coins = { silver: 0, gold: 0, score: distance }) {
  overlay.querySelector('.reason').textContent = reason;
  overlay.querySelector('.distance').textContent = `You ran ${distance.toLocaleString('en-US')} m`;
  overlay.querySelector('.coins').innerHTML = coinsLine(coins.silver, coins.gold, coins.score);
  if (journey) {
    const percent = Math.min(99, Math.floor((distance / journey.length) * 100));
    overlay.querySelector('.best').textContent =
      `${percent}% of the way to the sea` + (journey.bestTime ? ` · Best time ${formatTime(journey.bestTime)}` : '');
  } else {
    overlay.querySelector('.best').textContent = isNewBest ? 'New best score!' : `Best score: ${best.toLocaleString('en-US')}`;
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

// ---- End screen: reached Pliny's ships (Escape mode) ----
// Built to fit a phone held upright: title, three numbers in a row, the map,
// a short epilogue and two buttons. It takes its own touches (data-control),
// so it can scroll on a small screen and a stray tap doesn't start a new run:
// "Run again" (or R) does.
const finish = document.createElement('div');
finish.id = 'finish';
finish.hidden = true;
finish.setAttribute('data-control', '');
finish.innerHTML = `
  <div class="card">
    <h1>Safe aboard Pliny's boat</h1>
    <p class="where">Stabiae, 79 AD</p>
    <dl class="stats">
      <div class="stat"><dt>Time</dt><dd class="time"></dd></div>
      <div class="stat"><dt>Distance</dt><dd class="distance"></dd></div>
      <div class="stat"><dt>Saved</dt><dd class="saved"></dd></div>
    </dl>
    <p class="coins"></p>
    <p class="best"></p>
    <p class="unlocked" hidden>Endless mode unlocked</p>
    <canvas class="route" aria-label="Map of your route from Pompeii to the sea"></canvas>
    <div class="epilogue"></div>
    <div class="actions">
      <button type="button" class="again">Run again</button>
      <button type="button" class="menu">Menu</button>
    </div>
    <p class="hint">or press R</p>
  </div>
`;
document.body.appendChild(finish);

// The map of the run: the route as a gold line from Pompeii to the shore,
// the places passed on the way, a boat where it ends. route: { points:
// [[x, z], ...], places: [{ name, x, z }] } in the town's coordinates; the
// first street runs up the map.
function drawRoute(canvas, route) {
  const [w, h] = ROUTE_MAP.size;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.aspectRatio = `${w} / ${h}`; // CSS sets the width (at most w px); the height follows
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const points = route.points;
  if (points.length < 2) return;
  // Fit the route in the canvas, the same scale both ways.
  const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const pad = 26;
  const scale = Math.min((w - 2 * pad) / Math.max(1, maxX - minX), (h - 2 * pad) / Math.max(1, maxZ - minZ));
  const ox = w / 2 - ((minX + maxX) / 2) * scale, oy = h / 2 - ((minZ + maxZ) / 2) * scale;
  const at = (x, z) => [ox + x * scale, oy + z * scale];
  // the route
  g.lineJoin = g.lineCap = 'round';
  g.strokeStyle = 'rgba(216, 178, 90, 0.35)';
  g.lineWidth = 7;
  g.beginPath();
  points.forEach(([x, z], i) => (i ? g.lineTo(...at(x, z)) : g.moveTo(...at(x, z))));
  g.stroke();
  g.strokeStyle = '#d8b25a';
  g.lineWidth = 2.5;
  g.stroke();
  // the places on the way
  g.font = '11px system-ui, sans-serif';
  g.textBaseline = 'middle';
  const label = (text, x, y, color) => {
    const right = x < w - 80;
    g.fillStyle = color;
    g.textAlign = right ? 'left' : 'right';
    g.fillText(text, x + (right ? 8 : -8), y);
  };
  const [sx, sy] = at(...points[0]);
  g.fillStyle = '#9a2026';
  g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fill();
  label('Pompeii', sx, sy, '#f1ead8');
  for (const p of route.places) {
    if (p.name === 'Stabiae') continue; // the end has its own mark
    const [x, y] = at(p.x, p.z);
    g.fillStyle = '#f1ead8';
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    label(p.name, x, y, 'rgba(241, 234, 216, 0.85)');
  }
  // the shore: a boat
  const [ex, ey] = at(...points[points.length - 1]);
  g.fillStyle = '#6fa3b8';
  g.beginPath(); g.moveTo(ex - 7, ey - 2); g.lineTo(ex + 7, ey - 2); g.lineTo(ex + 4, ey + 3); g.lineTo(ex - 4, ey + 3); g.closePath(); g.fill();
  g.fillRect(ex - 0.6, ey - 10, 1.2, 8);
  label('Stabiae', ex, ey, '#cfe6ee');
}

export function showFinish({ distance, time, saved, bestTime, isNewBest, unlocked, route, epilogue, coins }) {
  finish.querySelector('.coins').innerHTML = coinsLine(coins.silver, coins.gold, coins.score);
  finish.querySelector('.distance').textContent = `${distance.toLocaleString('en-US')} m`;
  finish.querySelector('.time').textContent = formatTime(time);
  finish.querySelector('.saved').textContent = String(saved);
  const best = finish.querySelector('.best');
  best.textContent = isNewBest ? 'New best time!' : `Best time ${formatTime(bestTime)}`;
  best.classList.toggle('new', isNewBest);
  finish.querySelector('.unlocked').hidden = !unlocked;
  const text = finish.querySelector('.epilogue');
  text.replaceChildren(...epilogue.map((paragraph) => Object.assign(document.createElement('p'), { textContent: paragraph })));
  finish.hidden = false;
  finish.scrollTop = 0;
  drawRoute(finish.querySelector('.route'), route);
}

// The end screen's "Run again" button.
export function setupRunAgain(onRunAgain) {
  const button = finish.querySelector('.again');
  button.addEventListener('click', () => {
    button.blur();
    onRunAgain();
  });
}
