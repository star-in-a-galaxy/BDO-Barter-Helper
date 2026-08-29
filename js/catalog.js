let barterGoods = null;
let barterPorts = null;
let barterTierPorts = null;
let barterT6T7Ports = null;

export async function loadBarterGoods() {
  if (barterGoods) return barterGoods;
  const response = await fetch('assets/barterGoods.json');
  barterGoods = await response.json();
  return barterGoods;
}

export async function loadBarterPorts() {
  if (barterPorts) return barterPorts;
  const response = await fetch('assets/barterPorts.json');
  barterPorts = await response.json();
  return barterPorts;
}

// Which exact T6/T7 items each port offers (from assets/barterTierPorts.json,
// generated from assets/barter_items/T6_items.txt + T7_items.txt). T6/T7 items
// are port-specific, so they can never be ambiguous.
export async function loadBarterTierPorts() {
  if (barterTierPorts) return barterTierPorts;
  const response = await fetch('assets/barterTierPorts.json');
  barterTierPorts = await response.json();
  return barterTierPorts;
}

// Which T7 ports accept each T6 item, and which T7 items a T6 can yield at a
// given port (from assets/t6T7Ports.json, derived from barterRoutes.json). Used
// to pin the exact T6→T7 port from a real T6 item and to fill the received T7
// item as a fallback when the screenshot didn't read it.
export async function loadT6T7Ports() {
  if (barterT6T7Ports) return barterT6T7Ports;
  const response = await fetch('assets/t6T7Ports.json');
  barterT6T7Ports = await response.json();
  return barterT6T7Ports;
}

export async function getCatalog() {
  const goods = await loadBarterGoods();
  const ports = await loadBarterPorts();
  
  const t4Items = goods.filter(item => item.tier === 'level_4');
  const t5Items = goods.filter(item => item.tier === 'level_5');
  const t6Items = goods.filter(item => item.tier === 'level_6');
  const t7Items = goods.filter(item => item.tier === 'level_7');
  
  const t5Islands = Object.values(ports)
    .filter(port => port.name.includes('Island') && !port.name.includes('T5'))
    .map(port => port.name);
  
  const t6ByRegion = {
    'North': ['Haemo Island', 'Dallae Pier'],
    'South': ['Grándiha', 'Starry Midnight Port'],
    'East': ['Hakoven Island', 'Arehaza']
  };
  
  const t7ByRegion = {
    'A': ['Olvia Coast', 'Epheria Sentry Post'],
    'B': ['Iliya Island', 'Lema Island'],
    'C': ['Sanctuary Coastal Outpost', 'Sausan Garrison Wharf']
  };
  
  const chainOptions = [];
  ['North', 'South', 'East'].forEach(region => {
    const traders = t6ByRegion[region] || [];
    traders.forEach(trader => {
      chainOptions.push(`${region} - ${trader}`);
    });
  });
  
  return {
    t4Items: t4Items,
    t5Items: t5Items,
    t6Items: t6Items,
    t7Items: t7Items,
    t5Islands: t5Islands,
    t6ByRegion: t6ByRegion,
    t7ByRegion: t7ByRegion,
    chainOptions: chainOptions,
    ports: ports,
    goods: goods
  };
}
