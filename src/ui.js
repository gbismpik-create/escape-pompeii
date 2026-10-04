// The game-over overlay. Plain HTML on top of the canvas.

const overlay = document.createElement('div');
overlay.id = 'game-over';
overlay.hidden = true;
overlay.innerHTML = `
  <h1>Game over</h1>
  <p class="distance"></p>
  <p class="hint">Tap or press R to run again</p>
`;
document.body.appendChild(overlay);

export function showGameOver(distance) {
  overlay.querySelector('.distance').textContent = `You ran ${distance} m`;
  overlay.hidden = false;
}

export function hideGameOver() {
  overlay.hidden = true;
}
