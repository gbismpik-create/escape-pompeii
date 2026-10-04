// The four street chunk layouts, built once at load from the building kit.
// "a" is metres along the 30 m chunk; side -1 is left, 1 is right.
import { TOWN } from './config.js';
import {
  FACADE_X, createLayout, house, shop, counter, awning, colonnade, fountain, shrine, sideStreet,
} from './architecture.js';

const P = TOWN.plaster;

function street() {
  const L = createLayout('street');
  house(L, { side: -1, a: 0, length: 7, height: 4.2, plaster: P.ochre, doorAt: 0.35 });
  house(L, { side: -1, a: 7, length: 6, height: 6.6, plaster: P.cream });
  shop(L, { side: -1, a: 13, length: 7, height: 4.6, plaster: P.terracotta });
  house(L, { side: -1, a: 20, length: 10, height: 5.8, plaster: P.ochre, doorAt: 0.7 });
  house(L, { side: 1, a: 0, length: 9, height: 5.6, plaster: P.cream, doorAt: 0.6 });
  house(L, { side: 1, a: 9, length: 6, height: 4, plaster: P.rose });
  house(L, { side: 1, a: 15, length: 9, height: 6.8, plaster: P.ochre, doorAt: 0.3 });
  shop(L, { side: 1, a: 24, length: 6, height: 4.4, plaster: P.cream });
  return L;
}

function market() {
  const L = createLayout('market');
  const plasters = [P.terracotta, P.cream, P.ochre, P.rose, P.cream];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const a = i * 6;
      shop(L, { side, a, length: 6, height: i % 2 ? 5.2 : 4.4, plaster: plasters[(i + (side > 0 ? 2 : 0)) % 5] });
      if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
        counter(L, side, a + 3, 2.6);
        awning(L, side, a + 3, 4.6, TOWN.awning[(i + side) & 1]);
      }
    }
  }
  return L;
}

function crossroads() {
  const L = createLayout('crossroads');
  house(L, { side: -1, a: 0, length: 12, height: 5.4, plaster: P.cream, doorAt: 0.4 });
  house(L, { side: -1, a: 20, length: 10, height: 4.4, plaster: P.terracotta });
  house(L, { side: 1, a: 0, length: 12, height: 4.6, plaster: P.ochre, doorAt: 0.3 });
  shop(L, { side: 1, a: 20, length: 10, height: 6.2, plaster: P.rose });
  for (const side of [-1, 1]) sideStreet(L, side, 12, 8);
  fountain(L, -1, 10.6);
  shrine(L, 1, 11);
  return L;
}

function portico() {
  const L = createLayout('colonnade');
  colonnade(L, { side: -1, a: 0, length: 30, height: 4.2, plaster: P.ochre });
  // Opposite: a tall public building with pilasters and a long roof.
  house(L, { side: 1, a: 0, length: 30, height: 7.5, plaster: P.cream, doorAt: 0.5, windows: false });
  for (let a = 1.5; a < 30; a += 4) {
    if (Math.abs(a - 15) < 2) continue; // leave the doorway clear
    L.add('box', [FACADE_X - 0.1, 3.75, a], [0.2, 7.5, 0.5], TOWN.stucco);
  }
  return L;
}

export const CHUNK_LAYOUTS = [street(), market(), crossroads(), portico()];
