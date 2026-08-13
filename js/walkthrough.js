// SVG Icons as inline strings
const ICONS = {
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
  // Extract tier prefix and item name without it
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
  
  // Return img tag for the icon (icons are named level_{tier}_{name}.webp)
  return `<img src="assets/icons/level_${tier}_${safeName}.webp" alt="${cleanName}" style="width:20px;height:20px;vertical-align:middle;margin-right:4px;" onerror="this.style.display='none'">`;
}

function formatCount(count) {
  return `<span class="count-badge">${count}x</span>`;
}

function actionBadge(text) {
  return `<span class="action-badge">${text}</span>`;
}

function formatItemWithIcon(item, count) {
  return `<span class="barter-item">${formatCount(count)} ${getItemIcon(item)}${item}</span>`;
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

export function generateWalkthrough(actions) {
  const steps = [];
  let stepNum = 1;
  let currentRegion = null;
  
  // Track inventory state
  const shipItems = {};
  const playerItems = {};
  
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
    
    // Format location header: numbered step, wrapped in a port card
    steps.push(`<div class="port-card">`);
    steps.push(`<div class="port-main">`);
    steps.push(`<div class="port-header"><span class="step-badge">${stepNum}</span> ${ICONS.anchor} <strong>${loc}</strong></div>`);
    steps.push(`<div class="port-actions">`);
    
    // Format each action at this location
    for (const locAction of locationActions) {
      const actType = locAction.action;
      let formattedAction = '';
      
      if (actType === 'load_east_stock' || actType === 'load_t4_for_region' || actType === 'load_all_t4') {
        const items = locAction.items.map(item => ({ name: item, count: 5 }));
        formattedAction = formatLoadAction('Boat', items);
        // Update ship inventory
        items.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'trade_t5_to_t6') {
        const items = locAction.items;
        for (const item of items) {
          const outputItem = upgradeItem(item);
          formattedAction += formatBarterAction(item, outputItem, 5);
          // Update inventory
          shipItems[item] = (shipItems[item] || 0) - 5;
          if (shipItems[item] <= 0) delete shipItems[item];
          shipItems[outputItem] = (shipItems[outputItem] || 0) + 5;
        }
      }
      else if (actType === 'trade_t6_to_t7') {
        // Convert all T6 items to T7
        const t6Items = Object.keys(shipItems).filter(name => getItemTier(name) === 6 && shipItems[name] >= 5);
        for (const item of t6Items) {
          const outputItem = upgradeItem(item);
          const count = shipItems[item];
          formattedAction += formatBarterAction(item, outputItem, count);
          // Update inventory
          delete shipItems[item];
          shipItems[outputItem] = (shipItems[outputItem] || 0) + count;
        }
      }
      else if (actType === 'sell_t7') {
        // Sell all T7 items
        const t7Items = Object.keys(shipItems).filter(name => getItemTier(name) === 7);
        const itemList = t7Items.map(item => formatItemWithIcon(item, shipItems[item])).join(', ');
        formattedAction = `<div class="action-line">${ICONS.sell} Sell: ${itemList}</div>`;
        // Clear T7 items from inventory
        t7Items.forEach(item => delete shipItems[item]);
      }
      else if (actType === 'load_t4_and_player_items') {
        const boatItems = locAction.t4Items.map(item => ({ name: item, count: 5 }));
        const playerItemsList = locAction.playerItems.map(item => ({ name: item, count: 5 }));
        formattedAction = formatLoadAction('Boat', boatItems) + formatLoadAction('Player', playerItemsList);
        // Update inventory
        boatItems.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
        });
        playerItemsList.forEach(item => {
          playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'trade_t4_to_t5') {
        formattedAction = formatBarterAction(locAction.input, locAction.output, 5);
        // Update inventory
        shipItems[locAction.input] = (shipItems[locAction.input] || 0) - 5;
        if (shipItems[locAction.input] <= 0) delete shipItems[locAction.input];
        shipItems[locAction.output] = (shipItems[locAction.output] || 0) + 5;
      }
      else if (actType === 'swap_ship_player') {
        const playerToShip = locAction.playerToShip;
        const shipToPlayer = locAction.shipToPlayer;
        formattedAction = formatSwapAction('Player→Boat', playerToShip) + formatSwapAction('Boat→Player', shipToPlayer);
        // Update inventory
        shipToPlayer.forEach(item => {
          shipItems[item] = (shipItems[item] || 0) - 5;
          if (shipItems[item] <= 0) delete shipItems[item];
          playerItems[item] = (playerItems[item] || 0) + 5;
        });
        playerToShip.forEach(item => {
          playerItems[item] = (playerItems[item] || 0) - 5;
          if (playerItems[item] <= 0) delete playerItems[item];
          shipItems[item] = (shipItems[item] || 0) + 5;
        });
      }
      else if (actType === 'store_east_t5') {
        formattedAction = formatStoreAction(locAction.items);
        locAction.items.forEach(item => {
          shipItems[item] = (shipItems[item] || 0) - 5;
          if (shipItems[item] <= 0) delete shipItems[item];
        });
      }
      else if (actType === 'load_south_t5_and_retrieve_east') {
        const shipItemsList = locAction.shipItems.map(item => ({ name: item, count: 5 }));
        const playerItemsList = locAction.playerItems.map(item => ({ name: item, count: 5 }));
        formattedAction = formatLoadAction('Boat', shipItemsList) + formatLoadAction('Player', playerItemsList);
        // Update inventory
        shipItemsList.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
        });
        playerItemsList.forEach(item => {
          playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'sell_t7_and_restock') {
        formattedAction = formatSellAction(['[Level 7] T7 Item']) + formatStoreAction(locAction.items);
        locAction.items.forEach(item => {
          playerItems[item] = (playerItems[item] || 0) + 5;
        });
      }
      // New action types from optimized route builder
      else if (actType === 'load_ship') {
        const items = locAction.items;
        formattedAction = formatLoadAction('Boat', items);
        items.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'load_player') {
        const items = locAction.items;
        formattedAction = formatLoadAction('Player', items);
        items.forEach(item => {
          playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'trade') {
        // Generic trade action
        const input = locAction.input;
        const output = locAction.output;
        const count = locAction.count || 5;
        formattedAction = formatBarterAction(input, output, count);
        // Update inventory
        shipItems[input] = (shipItems[input] || 0) - count;
        if (shipItems[input] <= 0) delete shipItems[input];
        shipItems[output] = (shipItems[output] || 0) + count;
      }
      else if (actType === 'swap') {
        const playerToShip = locAction.playerToShip;
        const shipToPlayer = locAction.shipToPlayer;
        formattedAction = formatSwapAction('Player→Boat', playerToShip.map(i => i.name)) + formatSwapAction('Boat→Player', shipToPlayer.map(i => i.name));
        // Update inventory
        shipToPlayer.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) - item.count;
          if (shipItems[item.name] <= 0) delete shipItems[item.name];
          playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
        });
        playerToShip.forEach(item => {
          playerItems[item.name] = (playerItems[item.name] || 0) - item.count;
          if (playerItems[item.name] <= 0) delete playerItems[item.name];
          shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'store_epheria') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.store} Store at Epheria: ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) - item.count;
          if (shipItems[item.name] <= 0) delete shipItems[item.name];
        });
      }
      else if (actType === 'store_ilya') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.store} Store at Ilya: ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) - item.count;
          if (shipItems[item.name] <= 0) delete shipItems[item.name];
        });
      }
      else if (actType === 'retrieve_epheria') {
        const items = locAction.items;
        const target = locAction.target === 'ship' ? 'Boat' : 'Player';
        formattedAction = `<div class="action-line">${ICONS.load} Retrieve from Epheria: ${ICONS[target === 'Boat' ? 'boat' : 'player']} ${target} ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => {
          if (locAction.target === 'ship') {
            shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
          } else {
            playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
          }
        });
      }
      else if (actType === 'move_to_player') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.swap} ${actionBadge('Move:')} ${ICONS.player} ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => {
          shipItems[item.name] = (shipItems[item.name] || 0) - item.count;
          if (shipItems[item.name] <= 0) delete shipItems[item.name];
          playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'move_to_ship') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.swap} ${actionBadge('Move:')} ${ICONS.boat} ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => {
          playerItems[item.name] = (playerItems[item.name] || 0) - item.count;
          if (playerItems[item.name] <= 0) delete playerItems[item.name];
          shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
        });
      }
      else if (actType === 'sell') {
        const items = locAction.items;
        formattedAction = `<div class="action-line">${ICONS.sell} Sell: ${items.map(i => formatItemWithIcon(i.name, i.count)).join(', ')}</div>`;
        items.forEach(item => {
          playerItems[item.name] = (playerItems[item.name] || 0) - item.count;
          if (playerItems[item.name] <= 0) delete playerItems[item.name];
        });
      }
      
      if (formattedAction) {
        steps.push(formattedAction);
      }
    }
    
    // Close actions + main content, append the Done checkbox, close the card
    steps.push(`</div>`);
    steps.push(`</div>`);
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
