import { SHOP, POWERUPS } from './config.js';
import { loadWallet, saveWallet } from './storage.js';

// The player's wallet: silver and gold, power-up levels, the characters
// owned and the one chosen, and how much silver went into gold today.
// Kept in localStorage (storage.js); save() after every change that matters
// (end of a run, a purchase, a revive).

const POWERUP_TYPES = ['magnet', 'double', 'aegis', 'wings'];
const MAX_LEVEL = SHOP.levelCosts.length + 1;
const today = () => new Date().toDateString(); // the player's own day

function fresh() {
  return {
    silver: 0,
    gold: 0,
    levels: Object.fromEntries(POWERUP_TYPES.map((t) => [t, 1])),
    owned: ['legionary'],
    selected: 'legionary',
    exchange: { day: today(), gold: 0 }, // gold bought with silver today
  };
}

// What a power-up does at a level: { duration } for the timed ones,
// { crashes, grace } for the aegis. Level 1 is POWERUPS' base, level 5
// SHOP.topLevel, evenly spaced between.
export function powerupAt(type, level) {
  const k = (level - 1) / (MAX_LEVEL - 1);
  const lerp = (a, b) => a + (b - a) * k;
  if (type === 'aegis') {
    return { crashes: level >= MAX_LEVEL ? SHOP.topLevel.aegisCrashes : 1, grace: lerp(POWERUPS.aegis.grace, SHOP.topLevel.aegisGrace) };
  }
  return { duration: Math.round(lerp(POWERUPS[type].duration, SHOP.topLevel[type])) };
}

export function createWallet() {
  const w = { ...fresh(), ...(loadWallet() ?? {}) };
  w.levels = { ...fresh().levels, ...w.levels };
  if (!Array.isArray(w.owned) || !w.owned.includes('legionary')) w.owned = ['legionary', ...(w.owned ?? [])];
  if (!w.owned.includes(w.selected)) w.selected = 'legionary';
  const character = (id) => SHOP.characters.find((c) => c.id === id);

  return {
    get silver() {
      return w.silver;
    },
    get gold() {
      return w.gold;
    },
    save() {
      saveWallet(w);
    },
    // Coins picked up in a run (saved at the end of it).
    add(type, n = 1) {
      w[type] += n;
    },
    canPay(price) {
      return !price || ((price.silver ?? 0) <= w.silver && (price.gold ?? 0) <= w.gold);
    },
    // Takes the price if there is enough; true if paid.
    pay(price) {
      if (!this.canPay(price)) return false;
      w.silver -= price?.silver ?? 0;
      w.gold -= price?.gold ?? 0;
      saveWallet(w);
      return true;
    },

    // ---- power-up levels
    level: (type) => w.levels[type],
    maxLevel: MAX_LEVEL,
    // The silver the next level costs, or null at the top.
    upgradeCost(type) {
      const level = w.levels[type];
      return level >= MAX_LEVEL ? null : SHOP.levelCosts[level - 1];
    },
    upgrade(type) {
      const cost = this.upgradeCost(type);
      if (cost === null || !this.pay({ silver: cost })) return false;
      w.levels[type]++;
      saveWallet(w);
      return true;
    },

    // ---- characters
    owns: (id) => w.owned.includes(id),
    get selected() {
      return w.selected;
    },
    buy(id) {
      const c = character(id);
      if (!c || w.owned.includes(id) || !this.pay(c.price)) return false;
      w.owned.push(id);
      w.selected = id;
      saveWallet(w);
      return true;
    },
    select(id) {
      if (!w.owned.includes(id)) return false;
      w.selected = id;
      saveWallet(w);
      return true;
    },

    // ---- the money changer
    // Gold bought with silver today (the day rolls over at local midnight).
    get goldBoughtToday() {
      if (w.exchange.day !== today()) w.exchange = { day: today(), gold: 0 };
      return w.exchange.gold;
    },
    goldToSilver() {
      if (w.gold < 1) return false;
      w.gold -= 1;
      w.silver += SHOP.exchange.goldToSilver;
      saveWallet(w);
      return true;
    },
    silverToGold() {
      if (this.goldBoughtToday >= SHOP.exchange.goldPerDay || w.silver < SHOP.exchange.silverPerGold) return false;
      w.silver -= SHOP.exchange.silverPerGold;
      w.gold += 1;
      w.exchange.gold++;
      saveWallet(w);
      return true;
    },

    // ---- revive: the gold the nth revive of a run costs (n from 0), or null if no more
    reviveCost: (n) => SHOP.revive.costs[n] ?? null,
  };
}
