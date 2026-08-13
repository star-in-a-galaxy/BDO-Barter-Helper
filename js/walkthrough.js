import { ICONS, formatItemWithIcon, Inventory, formatInventory } from './inventory.js';

function formatCount(count) {
  return `<span class="count-badge">${count}x</span>`;
}

function actionBadge(text) {
  return `<span class="action-badge">${text}</span>`;
}

function formatBarterAction(input, output, count) {
  return `<div class="action-line">${ICONS.barter} ${actionBadge('Barter:')} ${formatItemWithIcon(input, count)} <span class="action-arrow">${ICONS.arrow}</span> ${formatItemWithIcon(output, count)}</div>`;
}

function formatSellAction(items) {
  const itemList = items.map(item => formatItemWithIcon(item, 5)).join(', ');
  return `<div class="action-line">${ICONS.sell} Sell: ${itemList}</div>`;
}

function formatLoadAction(target, items) {
  const targetIcon = target === 'Player' ? ICONS.player : ICONS.boat;
  const itemList = items.map(item => formatItemWithIcon(item.name, item.count)).join(', ');
  return `<div class="action-line">${ICONS.load} ${actionBadge('Load:')} ${targetIcon} ${target} ${itemList}</div>`;
}

function formatStoreAction(items) {
  const itemList = items.map(item => formatItemWithIcon(item, 5)).join(', ');
  return `<div class="action-line">${ICONS.store} Store: ${itemList}</div>`;
}

function formatSwapAction(direction, items) {
  const dirIcon = direction === 'Player→Boat' 
    ? `${ICONS.player}→${ICONS.boat}` 
    : `${ICONS.boat}→${ICONS.player}`;
  // Handle both string arrays and object arrays
  const itemList = items.map(item => {
    if (typeof item === 'string') {
      return formatItemWithIcon(item, 5);
    } else {
      return formatItemWithIcon(item.name, item.count);
    }
  }).join(', ');
  return `<div class="action-line">${ICONS.swap} Swap: ${dirIcon} ${itemList}</div>`;
}

export function generateWalkthrough(actions, opts = {}) {
  const steps = [];
  let stepNum = 1;
  let currentRegion = null;
  
  // Track inventory state
  const inv = new Inventory();
  
  function getItemTier(itemName) {
    if (itemName.includes('Level 4')) return 4;
    if (itemName.includes('Level 5')) return 5;
    if (itemName.includes('Level 6')) return 6;
    if (itemName.includes('Level 7')) return 7;
    return 0;
  }
  
  function upgradeItem(itemName) {
    return itemName.replace(/\[Level (\d)\]/, (match, num) => `[Level ${parseInt(num) + 1}]`);
  }
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const loc = action.location;
    
    // Group actions by location
    const locationActions = [action];
    while (i + 1 < actions.length && actions[i + 1].location === loc) {
      i++;
      locationActions.push(actions[i]);
    }
    
    // Inventory before this step's actions (for the per-step snapshot).
    const before = inv.snapshot();
    const swapped = locationActions.some(a =>
      ['swap', 'swap_ship_player', 'move_to_player', 'move_to_ship'].includes(a.action));
    
    // Region banner, placed before the step where a region's first T6 trade
    // happens. Only T5→T6 trades (output Level 6) advance the banner region;
    // T4→T5 trades (output Level 5) share the same region and must not suppress
    // it. Checked against the whole location group (a step may open with a
    // juggling "Move" before its T6 barter).
    const t6Trade = locationActions.find(a =>
      (a.action === 'trade_t5_to_t6' || (a.action === 'trade' && a.region)) &&
      (a.action === 'trade_t5_to_t6' || (a.output && a.output.includes('Level 6')))
    );
    const region = t6Trade && t6Trade.region;
    if (region && region !== currentRegion) {
      currentRegion = region;
      steps.push(`<div class="region-banner">--- ${region} T6 Chain ---</div>`);
    }
    
    // Format location header: numbered step, wrapped in a port card. The card
    // carries this step's boat/player inventory (before + after, weights) as
    // data attributes so a separate overlay panel can show it.
    const inner = [];
    inner.push(`<div class="port-main">`);
    inner.push(`<div class="port-header"><span class="step-badge">${stepNum}</span> ${ICONS.anchor} <strong>${loc}</strong></div>`);
    inner.push(`<div class="port-actions">`);
    
    // Format each action at this location
    for (const locAction of locationActions) {
      const actType = locAction.action;
      let formattedAction = '';
      
      if (actType === 'load_east_stock' || actType === 'load_t4_for_region' || actType === 'load_all_t4') {
        const items = locAction.items.map(item => ({ name: item, count: 5 }));
        formattedAction = formatLoadAction('Boat', items);
        items.forEach(item => inv.add('ship', item.name, item.count));
      }
      else if (actType === 'trade_t5_to_t6') {
        const items = locAction.items;
        for (const item of items) {
          const outputItem = upgradeItem(item);
          formattedAction += formatBarterAction(item, outputItem, 5);
          inv.trade(item, outputItem, 5);
        }
      }
      else if (actType === 'trade_t6_to_t7') {
        const t6Items = Object.keys(inv.ship).filter(name => getItemTier(name) === 6 && inv.ship[name] >= 5);
        for (const item of t6Items) {
          const outputItem = upgradeItem(item);
          const count = inv.ship[item];
          formattedAction += formatBarterAction(item, outputItem, count);
          inv.trade(item, outputItem, count);
        }
      }
      else if (actType === 'sell_t7') {
        const t7Items = Object.keys(inv.ship).filter(name => getItemTier(name) === 7);
        const itemList = t7Items.map(item => formatItemWithIcon(item, inv.ship[item])).join(', ');
        formattedAction = `<div class="action-line">${ICONS.sell} Sell: ${itemList}</div>`;
        t7Items.forEach(item => inv.remove('ship', item, inv.ship[item]));
      }
      else if (actType === 'load_t4_and_player_items') {
        const boatItems = locAction.t4Items.map(item => ({ name: item, count: 5 }));
        const playerItemsList = locAction.playerItems.map(item => ({ name: item, count: 5 }));
        formattedAction = formatLoadAction('Boat', boatItems) + formatLoadAction('Player', playerItemsList);
        boatItems.forEach(item => inv.add('ship', item.name, item.count));
        playerItemsList.forEach(item => inv.add('player', item.name, item.count));
      }
      else if (actType === 'trade_t4_to_t5') {
        formattedAction = formatBarterAction(locAction.input, locAction.output, 5);
        inv.trade(locAction.input, locAction.output, 5);
      }
      else if (actType === 'swap_ship_player') {
        const playerToShip = locAction.playerToShip;
        const shipToPlayer = locAction.shipToPlayer;
        formattedAction = formatSwapAction('Player→Boat', playerToShip) + formatSwapAction('Boat→Player', shipToPlayer);
        shipToPlayer.forEach(item => inv.move(item, 5, 'ship', 'player'));
        playerToShip.forEach(item => inv.move(item, 5, 'player', 'ship'));
      }
      else if (actType === 'store_east_t5') {
        formattedAction = formatStoreAction(locAction.items);
        locAction.items.forEach(item => inv.remove('ship', item, 5));
      }
      else if (actType === 'load_south_t5_and_retrieve_east') {
        const shipItemsList = locAction.shipItems.map(item => ({ name: item, count: 5 }));
        const playerItemsList = locAction.playerItems.map(item => ({ name: item, count: 5 }));
        formattedAction = formatLoadAction('Boat', shipItemsList) + formatLoadAction('Player', playerItemsList);
        shipItemsList.forEach(item => inv.add('ship', item.name, item.count));
        playerItemsList.forEach(item => inv.add('player', item.name, item.count));
      }
      else if (actType === 'sell_t7_and_restock') {
        formattedAction = formatSellAction(['[Level 7] T7 Item']) + formatStoreAction(locAction.items);
        locAction.items.forEach(item => inv.add('player', item, 5));
      }
      // New action types from optimized route builder
      else if (actType === 'load_ship') {
        const items = locAction.items;
        formattedAction = formatLoadAction('Boat', items);
        items.forEach(item => inv.add('ship', item.name, item.count));
      }
      else if (actType === 'load_player') {
        const items = locAction.items;
        formattedAction = formatLoadAction('Player', items);
        items.forEach(item => inv.add('player', item.name, item.count));
      }
      else if (actType === 'trade') {
        const input = locAction.input;
        const output = locAction.output;
        const count = locAction.count || 5;
        formattedAction = formatBarterAction(input, output, count);
        inv.trade(input, output, count);
      }
      else if (actType === 'swap') {
        const playerToShip = locAction.playerToShip;
        const shipToPlayer = locAction.shipToPlayer;
        formattedAction = formatSwapAction('Player→Boat', playerToShip.map(i => i.name)) + formatSwapAction('Boat→Player', shipToPlayer.map(i => i.name));
        shipToPlayer.forEach(item => inv.move(item.name, item.count, 'ship', 'player'));
        playerToShip.forEach(item => inv.move(item.name, item.count, 'player', 'ship'));
      }
      else if (actType === 'store_epheria') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.store} Store at Epheria: ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => inv.remove('ship', item.name, item.count));
      }
      else if (actType === 'store_ilya') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.store} Store at Ilya: ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => inv.remove('ship', item.name, item.count));
      }
      else if (actType === 'retrieve_epheria') {
        const items = locAction.items;
        const target = locAction.target === 'ship' ? 'Boat' : 'Player';
        formattedAction = `<div class="action-line">${ICONS.load} Retrieve from Epheria: ${ICONS[target === 'Boat' ? 'boat' : 'player']} ${target} ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => inv.add(locAction.target === 'ship' ? 'ship' : 'player', item.name, item.count));
      }
      else if (actType === 'move_to_player') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.swap} ${actionBadge('Move:')} ${ICONS.player} ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => inv.move(item.name, item.count, 'ship', 'player'));
      }
      else if (actType === 'move_to_ship') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.swap} ${actionBadge('Move:')} ${ICONS.boat} ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => inv.move(item.name, item.count, 'player', 'ship'));
      }
      else if (actType === 'sell') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.sell} Sell: ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => inv.remove('player', item.name, item.count));
      }
      
      if (formattedAction) {
        inner.push(formattedAction);
      }
    }
    
    // Close actions + main content
    inner.push(`</div>`);
    inner.push(`</div>`);

    const after = inv.snapshot();
    const enc = (o) => JSON.stringify(o).replace(/"/g, '&quot;');
    steps.push(`<div class="port-card" data-inv-ship="${enc(after.ship)}" data-inv-player="${enc(after.player)}" data-inv-ship-before="${enc(before.ship)}" data-inv-player-before="${enc(before.player)}" data-inv-swapped="${swapped ? 1 : 0}" data-inv-ship-max="${opts.shipMax ?? ''}" data-inv-player-max="${opts.playerMax ?? ''}" data-inv-player-used="${opts.playerUsedWeight ?? ''}">`);
    steps.push(...inner);
    steps.push(`<input type="checkbox" class="step-done" aria-label="Mark step ${stepNum} done">`);
    steps.push(`</div>`);
    stepNum++;
  }
  
  return steps.join('\n');
}

// Highlight the first step that isn't done yet and clear the rest.
function updateActiveStep(container) {
  const cards = Array.from(container.querySelectorAll('.port-card'));
  cards.forEach(c => c.classList.remove('active'));
  const first = cards.find(c => !c.classList.contains('done'));
  if (first) first.classList.add('active');
}

// The card for the current step (first one not marked done).
export function getActiveCard(container) {
  if (!container) return null;
  const cards = Array.from(container.querySelectorAll('.port-card'));
  return cards.find(c => c.classList.contains('active')) ||
         cards.find(c => !c.classList.contains('done')) ||
         cards[0] || null;
}

// Read the inventory snapshot attached to a step card (see generateWalkthrough).
export function getInventoryForCard(card) {
  if (!card) return null;
  const d = card.dataset;
  const parse = (v) => { try { return JSON.parse(v) || {}; } catch { return {}; } };
  return {
    before: { ship: parse(d.invShipBefore), player: parse(d.invPlayerBefore) },
    after: { ship: parse(d.invShip), player: parse(d.invPlayer) },
    swapped: d.invSwapped === '1',
    shipMax: parseFloat(d.invShipMax),
    playerMax: parseFloat(d.invPlayerMax),
    playerUsedWeight: parseFloat(d.invPlayerUsed)
  };
}

function getStepNumber(card) {
  const badge = card.querySelector('.step-badge');
  return badge ? parseInt(badge.textContent, 10) : null;
}

// The current step is the first card that isn't done (the active card).
export function getActiveStep(container) {
  if (!container) return null;
  const cards = Array.from(container.querySelectorAll('.port-card'));
  const active = cards.find(c => c.classList.contains('active')) || cards.find(c => !c.classList.contains('done'));
  return active ? getStepNumber(active) : null;
}

function notifyActiveStep(container) {
  container.dispatchEvent(new CustomEvent('activestep', {
    detail: { step: getActiveStep(container) }
  }));
}

// Wire up the per-step "Done" checkboxes (event delegation). Done is always a
// prefix: checking a later step auto-grays all previous steps; unchecking a
// step un-grays it and everything after it (later steps depend on it).
export function attachStepCheckboxes(container) {
  if (!container) return;
  container.addEventListener('change', (e) => {
    const input = e.target;
    if (!input.classList || !input.classList.contains('step-done')) return;
    const cards = Array.from(container.querySelectorAll('.port-card'));
    const idx = cards.indexOf(input.closest('.port-card'));
    if (idx === -1) return;
    cards.forEach((card, i) => {
      // Checking step idx marks 1..idx done; unchecking marks idx..end NOT done
      // (steps before idx stay done).
      const checked = input.checked ? i <= idx : i < idx;
      const cb = card.querySelector('.step-done');
      if (cb) cb.checked = checked;
      card.classList.toggle('done', checked);
    });
    updateActiveStep(container);
    notifyActiveStep(container);
  });
  updateActiveStep(container);
  notifyActiveStep(container);
}
