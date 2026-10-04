// On-screen HTML on top of the canvas: the distance display and the
// game-over overlay.

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `<div class="distance">0 m</div><div class="best"></div>`;
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.id = 'game-over';
overlay.hidden = true;
overlay.innerHTML = `
  <h1>Game over</h1>
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

export function showBest(best) {
  hudBest.textContent = best > 0 ? `Best ${best} m` : '';
}

export function showGameOver(distance, best, isNewBest) {
  overlay.querySelector('.distance').textContent = `You ran ${distance} m`;
  overlay.querySelector('.best').textContent = isNewBest ? 'New best!' : `Best: ${best} m`;
  overlay.hidden = false;
}

export function hideGameOver() {
  overlay.hidden = true;
}
