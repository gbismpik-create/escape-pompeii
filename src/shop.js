import { SHOP } from './config.js';
import { coinIcon, powerupIcon, POWERUP_NAMES } from './ui.js';
import { powerupAt } from './wallet.js';

// The shop, from the start screen: the wallet at the top, then three tabs
// (power-up levels, characters, the money changer), each short enough to
// fit a phone held upright without scrolling. It takes its own taps
// (data-control), so nothing in it starts a run.

const n = (x) => x.toLocaleString('en-US');
const price = (p) => (p.gold ? `${coinIcon('gold')} ${n(p.gold)}` : `${coinIcon('silver')} ${n(p.silver)}`);
// What a power-up does at a level, in a few words.
function effectAt(type, level) {
  const at = powerupAt(type, level);
  if (type === 'aegis') return at.crashes > 1 ? `${at.crashes} crashes` : `${at.grace.toFixed(1)} s safe after`;
  return `${at.duration} s`;
}

const open = document.createElement('button');
open.type = 'button';
open.className = 'shop-open';
open.dataset.control = '';
open.textContent = 'Shop';
document.querySelector('#start').appendChild(open);

const shop = document.createElement('div');
shop.id = 'shop';
shop.hidden = true;
shop.dataset.control = '';
shop.setAttribute('role', 'dialog');
shop.setAttribute('aria-label', 'Shop');
shop.innerHTML = `
  <div class="card">
    <header>
      <h2>Shop</h2>
      <p class="wallet"></p>
      <button type="button" class="close" aria-label="Close the shop">✕</button>
    </header>
    <nav class="tabs">
      <button type="button" data-tab="powerups">Power-ups</button>
      <button type="button" data-tab="characters">Characters</button>
      <button type="button" data-tab="changer">Money changer</button>
    </nav>
    <section class="panel" data-panel="powerups"></section>
    <section class="panel" data-panel="characters"></section>
    <section class="panel" data-panel="changer"></section>
  </div>`;
document.body.appendChild(shop);

// wallet: wallet.js. onOpenChange(open): the game holds still while it is
// open. onWear(id): a character was chosen.
export function setupShop(wallet, { onOpenChange, onWear }) {
  let tab = 'powerups';

  function render() {
    shop.querySelector('.wallet').innerHTML = `${coinIcon('silver')} ${n(wallet.silver)} <span class="gap"></span> ${coinIcon('gold')} ${n(wallet.gold)}`;
    for (const button of shop.querySelectorAll('.tabs button')) button.classList.toggle('on', button.dataset.tab === tab);
    for (const panel of shop.querySelectorAll('.panel')) panel.hidden = panel.dataset.panel !== tab;

    shop.querySelector('[data-panel="powerups"]').innerHTML = Object.entries(POWERUP_NAMES).map(([type, [name, what]]) => {
      const level = wallet.level(type), cost = wallet.upgradeCost(type);
      const pips = Array.from({ length: wallet.maxLevel }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      const next = cost === null ? '' : ` → ${effectAt(type, level + 1)}`;
      const button = cost === null ? '<button type="button" disabled>Top level</button>'
        : `<button type="button" data-upgrade="${type}" ${wallet.silver < cost ? 'disabled' : ''}>Level ${level + 1}<small>${price({ silver: cost })}</small></button>`;
      return `<div class="row">${powerupIcon(type)}<div class="text"><b>${name}</b><span>${what}: ${effectAt(type, level)}${next}</span><span class="pips">${pips}</span></div>${button}</div>`;
    }).join('');

    shop.querySelector('[data-panel="characters"]').innerHTML = `<p class="note">Looks only: every character runs and jumps the same.</p>` +
      SHOP.characters.map((c) => {
        const worn = wallet.selected === c.id, owned = wallet.owns(c.id);
        const button = worn ? '<button type="button" disabled>Wearing</button>'
          : owned ? `<button type="button" data-wear="${c.id}">Wear</button>`
          : `<button type="button" data-buy="${c.id}" ${wallet.canPay(c.price) ? '' : 'disabled'}>${price(c.price)}</button>`;
        return `<div class="row"><div class="text"><b>${c.name}</b><span>${c.note}</span></div>${button}</div>`;
      }).join('');

    const E = SHOP.exchange, left = E.goldPerDay - wallet.goldBoughtToday;
    shop.querySelector('[data-panel="changer"]').innerHTML = `
      <p class="note">The money changer at the Forum trades both ways.</p>
      <div class="row"><div class="text"><b>${coinIcon('gold')} 1 → ${coinIcon('silver')} ${E.goldToSilver}</b><span>Any time</span></div>
        <button type="button" data-exchange="toSilver" ${wallet.gold < 1 ? 'disabled' : ''}>Change</button></div>
      <div class="row"><div class="text"><b>${coinIcon('silver')} ${E.silverPerGold} → ${coinIcon('gold')} 1</b><span>${left} of ${E.goldPerDay} left today</span></div>
        <button type="button" data-exchange="toGold" ${left <= 0 || wallet.silver < E.silverPerGold ? 'disabled' : ''}>Change</button></div>`;
  }

  const setOpen = (isOpen) => {
    shop.hidden = !isOpen;
    if (isOpen) render();
    else document.activeElement?.blur(); // keys go back to the game
    onOpenChange(isOpen);
  };
  open.addEventListener('click', () => setOpen(true));
  shop.querySelector('.close').addEventListener('click', () => setOpen(false));
  shop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  shop.addEventListener('click', (event) => {
    const b = event.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.tab) tab = b.dataset.tab;
    else if (b.dataset.upgrade) wallet.upgrade(b.dataset.upgrade);
    else if (b.dataset.buy) {
      if (wallet.buy(b.dataset.buy)) onWear(b.dataset.buy);
    } else if (b.dataset.wear) {
      if (wallet.select(b.dataset.wear)) onWear(b.dataset.wear);
    } else if (b.dataset.exchange === 'toSilver') wallet.goldToSilver();
    else if (b.dataset.exchange === 'toGold') wallet.silverToGold();
    else return;
    render();
  });
}
