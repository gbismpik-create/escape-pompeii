// On-screen HTML on top of the canvas: the distance display and the
// game-over overlay.

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `<div class="distance">0 m</div><div class="best"></div>`;
document.body.appendChild(hud);

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
