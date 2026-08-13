// Inventory tracking + rendering for the walkthrough.
//
// Tracks the Boat (ship) and Player item inventories as the walkthrough is
// generated, and renders a per-step snapshot panel showing the resulting
// inventories. Swap steps render `before → after` so the movement is visible.

// SVG icons shared by the walkthrough actions and the inventory panel.
export const ICONS = {
  anchor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>',
  barter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>',
  sell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M8 14h8"/></svg>',
  load: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M5 10l7-7 7 7"/></svg>',
  store: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M5 14l7 7 7-7"/></svg>',
  swap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M12 12v8M8 20h8"/></svg>',
  player: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  boat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/></svg>',
  arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
};

function getItemIcon(itemName) {
  const tierMatch = itemName.match(/\[Level (\d+)\]\s*/);
  const tier = tierMatch ? parseInt(tierMatch[1], 10) : 0;
  const cleanName = itemName.replace(/\[Level \d+\]\s*/, '').trim();

  // Region-based T6/T7 placeholders (e.g. "[Level 6] South") have no icon file
  if (tier >= 6 && /^(North|South|East)$/i.test(cleanName)) {
    return '';
  }

  const safeName = cleanName.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  return `<img src="assets/icons/level_${tier}_${safeName}.webp" alt="${cleanName}" style="width:20px;height:20px;vertical-align:middle;margin-right:4px;" onerror="this.style.display='none'">`;
}

function formatCount(count) {
  return `<span class="count-badge">${count}x</span>`;
}

export function formatItemWithIcon(item, count) {
  return `<span class="barter-item">${formatCount(count)} ${getItemIcon(item)}${item}</span>`;
}

// Mutable inventory state for one target (boat/player) tracked by the
// walkthrough as it is generated.
export class Inventory {
  constructor() {
    this.ship = {};
    this.player = {};
  }

  snapshot() {
    return { ship: { ...this.ship }, player: { ...this.player } };
  }

  add(target, name, count) {
    this[target][name] = (this[target][name] || 0) + count;
  }

  remove(target, name, count) {
    this[target][name] = (this[target][name] || 0) - count;
    if (this[target][name] <= 0) delete this[target][name];
  }

  trade(input, output, count) {
    this.remove('ship', input, count);
    this.add('ship', output, count);
  }

  move(name, count, from, to) {
    this.remove(from, name, count);
    this.add(to, name, count);
  }
}

// Per-step inventory snapshot panel. `before`/`after` are { ship, player }
// inventories; when `swapped` the step moved items between the two, so show the
// before → after change. Only items that actually left/reduced are shown struck
// through on the before side (so unchanged items aren't misleadingly crossed
// out); the after side shows the full resulting inventory. `opts` may carry
// { shipMax, playerMax } (lt) to show current weight / capacity.
export function formatInventory(before, after, swapped, opts = {}) {
  const itemLt = (name) => {
    const m = name.match(/\[Level (\d+)\]/);
    const tier = m ? parseInt(m[1], 10) : 4;
    return tier <= 5 ? 1000 : 2000;
  };
  const lt = (items) =>
    Object.entries(items).reduce((sum, [name, c]) => sum + c * itemLt(name), 0);
  const fmt = (items) => {
    const entries = Object.entries(items).filter(([, c]) => c > 0).sort(([a], [b]) => a.localeCompare(b));
    return entries.length ? entries.map(([name, c]) => formatItemWithIcon(name, c)).join(', ') : '<span class="inv-empty">empty</span>';
  };
  // Items that decreased or disappeared between before and after (with the delta).
  const removed = (b, a) => {
    const out = {};
    for (const [name, c] of Object.entries(b)) {
      const afterCount = a[name] || 0;
      if (afterCount < c) out[name] = c - afterCount;
    }
    return out;
  };
  const row = (icon, label, b, a, maxKey) => {
    // Player weight = item weight + character's base used weight (equipment).
    const base = maxKey === 'playerMax' ? (opts.playerUsedWeight || 0) : 0;
    const used = lt(a) + base;
    const max = opts[maxKey];
    let wt = '';
    if (typeof max === 'number') {
      let extra = '';
      if (max > 0 && used > max) {
        extra = ` <span class="inv-overweight">(overweight ${Math.round((used / max) * 100)}%)</span>`;
      }
      wt = ` — <span class="inv-weight">${used.toLocaleString()}/${max.toLocaleString()}lt</span>${extra}`;
    }
    let line = `${fmt(a)}${wt}`;
    if (swapped) {
      const gone = removed(b, a);
      if (Object.keys(gone).length) {
        line = `<span class="inv-before">${fmt(gone)}</span> <span class="action-arrow">${ICONS.arrow}</span> ${fmt(a)}${wt}`;
      }
    }
    return `<div class="inv-row">${icon} <span class="inv-label">${label}:</span> ${line}</div>`;
  };
  return `<div class="inv-panel">${row(ICONS.boat, 'Boat', before.ship, after.ship, 'shipMax')}${row(ICONS.player, 'Player', before.player, after.player, 'playerMax')}</div>`;
}
