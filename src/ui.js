// On-screen HTML on top of the canvas: the distance display and the
// game-over overlay.

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `<div class="distance">0 m</div><div class="best"></div>`;
document.body.appendChild(hud);

// Mute button, top right. data-control keeps its taps away from the swipe
// and tap handling in input.js.
const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const muteButton = document.createElement('button');
muteButton.id = 'mute';
muteButton.type = 'button';
muteButton.dataset.control = '';
document.body.appendChild(muteButton);

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
`;
document.body.appendChild(overlay);

const hudDistance = hud.querySelector('.distance');
const hudBest = hud.querySelector('.best');
let shownDistance = -1;

// Called every frame, but only touches the page when the number changes:
// updating the page is much slower than checking a number.
export function updateDistance(distance) {
  if (distance === shownDistance) return;
  shownDistance = distance;
  hudDistance.textContent = `${distance} m`;
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

export function showGameOver(distance, best, isNewBest, reason = '') {
  overlay.querySelector('.reason').textContent = reason;
  overlay.querySelector('.distance').textContent = `You ran ${distance} m`;
  overlay.querySelector('.best').textContent = isNewBest ? 'New best!' : `Best: ${best} m`;
  overlay.hidden = false;
}

export function hideGameOver() {
  overlay.hidden = true;
}
