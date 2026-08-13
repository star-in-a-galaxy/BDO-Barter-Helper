import { getCatalog } from './catalog.js';
import { planRoute } from './planner.js';
import { attachStepCheckboxes } from './walkthrough.js';
import { initMapOverlay, drawRoute, clearRoute, setActiveStep } from './map-overlay.js';
import { scanImages as clientScan } from './scanner.js';

let catalog = null;
let tradeRows = [];

const DEFAULT_TRADES = [
  { region: 'North', chain: 'Dallae Pier', t5: '[Level 5] Octagonal Box', t4: '[Level 4] Stolen Pirate Dagger', island: 'Ajir Island' },
  { region: 'North', chain: 'Haemo Island', t5: '[Level 5] Mysterious Rock', t4: '[Level 4] Marine Knights\' Helm', island: 'Baremi Island' },
  { region: 'South', chain: 'Starry Midnight Port', t5: '[Level 5] Luxury Patterned Fabric', t4: '[Level 4] Pirate\'s Key', island: 'Orffs Island' },
  { region: 'South', chain: 'Grandiha', t5: '[Level 5] Portrait of the Ancient', t4: '[Level 4] Headless Dragon Figurine', island: 'Narvo Island' },
  { region: 'East', chain: 'Arehaza', t5: '[Level 5] 102 Year Old Golden Herb', t4: '[Level 4] Panacea', island: 'Padix Island' },
  { region: 'East', chain: 'Hakoven Island', t5: '[Level 5] Golden Fish Scale', t4: '[Level 4] Seashell Deco', island: 'Oben Island' }
];

function createFilterDropdown(container, options, initialValue, showIcon = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dropdown-wrapper';
  
  const inputContainer = document.createElement('div');
  inputContainer.className = 'input-container';
  
  const selectedIcon = document.createElement('img');
  selectedIcon.className = 'selected-icon';
  selectedIcon.style.display = 'none';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'filter-input';
  input.value = initialValue || '';
  input.placeholder = 'Type to filter...';
  
  inputContainer.appendChild(selectedIcon);
  inputContainer.appendChild(input);
  
  const list = document.createElement('div');
  list.className = 'dropdown-list';
  
  let selectedValue = initialValue || '';
  let previousValue = initialValue || '';
  let isCleared = false;
  
  function getItemName(opt) {
    return typeof opt === 'string' ? opt : opt.name;
  }
  
  function getItemIcon(opt) {
    return typeof opt === 'object' && opt.icon ? opt.icon : null;
  }
  
  function updateSelectedIcon() {
    if (!showIcon) return;
    const opt = options.find(o => getItemName(o) === selectedValue);
    const icon = opt ? getItemIcon(opt) : null;
    if (icon) {
      selectedIcon.src = icon;
      selectedIcon.style.display = 'inline-block';
    } else {
      selectedIcon.style.display = 'none';
    }
  }
  
  // Set initial icon
  updateSelectedIcon();
  
  function renderList(filter, showPreviousAtTop = false) {
    list.innerHTML = '';
    
    // If showing previous value at top and we have one
    if (showPreviousAtTop && previousValue && !filter) {
      const previousOpt = options.find(opt => getItemName(opt) === previousValue);
      if (previousOpt) {
        const item = document.createElement('div');
        item.className = 'dropdown-item previous-item';
        item.style.borderBottom = '1px solid #444';
        item.style.marginBottom = '4px';
        item.style.paddingBottom = '4px';
        
        if (showIcon && getItemIcon(previousOpt)) {
          const icon = document.createElement('img');
          icon.src = getItemIcon(previousOpt);
          icon.className = 'dropdown-icon';
          icon.width = 24;
          icon.height = 24;
          item.appendChild(icon);
        }
        
        const text = document.createElement('span');
        text.textContent = getItemName(previousOpt);
        text.style.color = '#888';
        item.appendChild(text);
        
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectedValue = getItemName(previousOpt);
          input.value = selectedValue;
          previousValue = selectedValue;
          isCleared = false;
          list.classList.remove('show');
          updateSelectedIcon();
          input.blur();
          input.dispatchEvent(new Event('change'));
        });
        list.appendChild(item);
      }
    }
    
    const filtered = options.filter(opt => {
      const name = getItemName(opt);
      // Skip the previous value if we're showing it at top
      if (showPreviousAtTop && !filter && name === previousValue) return false;
      return name.toLowerCase().includes(filter.toLowerCase());
    });
    
    filtered.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      if (getItemName(opt) === selectedValue) item.classList.add('selected');
      
      if (showIcon && getItemIcon(opt)) {
        const icon = document.createElement('img');
        icon.src = getItemIcon(opt);
        icon.className = 'dropdown-icon';
        icon.width = 24;
        icon.height = 24;
        item.appendChild(icon);
      }
      
      const text = document.createElement('span');
      text.textContent = getItemName(opt);
      item.appendChild(text);
      
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectedValue = getItemName(opt);
        input.value = selectedValue;
        previousValue = selectedValue;
        isCleared = false;
        list.classList.remove('show');
        updateSelectedIcon();
        input.blur();
        input.dispatchEvent(new Event('change'));
      });
      list.appendChild(item);
    });
  }
  
  input.addEventListener('focus', () => {
    // Clear the input and show previous value at top
    previousValue = selectedValue;
    input.value = '';
    isCleared = true;
    if (showIcon) selectedIcon.style.display = 'none';
    renderList('', true);
    list.classList.add('show');
  });
  
  input.addEventListener('input', () => {
    // Once user starts typing, don't show previous at top anymore
    isCleared = false;
    renderList(input.value, false);
    list.classList.add('show');
    selectedValue = '';
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Restore previous value
      input.value = previousValue;
      selectedValue = previousValue;
      isCleared = false;
      list.classList.remove('show');
      updateSelectedIcon();
      input.blur();
    }
  });
  
  input.addEventListener('blur', () => {
    setTimeout(() => {
      list.classList.remove('show');
      // If still cleared (user didn't select anything), restore previous value
      if (isCleared && !input.value) {
        input.value = previousValue;
        selectedValue = previousValue;
        isCleared = false;
        updateSelectedIcon();
      }
    }, 100);
  });
  
  wrapper.appendChild(inputContainer);
  wrapper.appendChild(list);
  container.appendChild(wrapper);
  
  return {
    getValue: () => selectedValue || input.value,
    setValue: (val) => {
      selectedValue = val;
      previousValue = val;
      input.value = val;
    }
  };
}

function createTradeRow(trade) {
  const row = document.createElement('tr');
  
  const regionCell = document.createElement('td');
  regionCell.textContent = `${trade.region} ${trade.chain}`;
  regionCell.style.fontWeight = 'bold';
  regionCell.style.color = '#5a9';
  
  const t5Cell = document.createElement('td');
  const t4Cell = document.createElement('td');
  const islandCell = document.createElement('td');
  
  const t5Dropdown = createFilterDropdown(t5Cell, catalog.t5Items, trade.t5, true);
  const t4Dropdown = createFilterDropdown(t4Cell, catalog.t4Items, trade.t4, true);
  const islandDropdown = createFilterDropdown(islandCell, catalog.t5Islands, trade.island, false);
  
  // If the user changes the T5 (or T4), the scanned real T6/T7 names no longer
  // apply, so drop them and let the optimizer fall back to region-based names.
  const clearRealT6T7 = () => { trade.t6 = undefined; trade.t7 = undefined; };
  const t5Input = t5Cell.querySelector('.filter-input');
  const t4Input = t4Cell.querySelector('.filter-input');
  if (t5Input) t5Input.addEventListener('change', clearRealT6T7);
  if (t4Input) t4Input.addEventListener('change', clearRealT6T7);
  
  row.appendChild(regionCell);
  row.appendChild(t5Cell);
  row.appendChild(t4Cell);
  row.appendChild(islandCell);
  
  return {
    element: row,
    getData: () => ({
      region: trade.region,
      chain: `${trade.region} - ${trade.chain}`,
      t5: t5Dropdown.getValue(),
      t4: t4Dropdown.getValue(),
      island: islandDropdown.getValue(),
      t6: trade.t6,
      t7: trade.t7
    })
  };
}

async function calculateRoute() {
  const btn = document.getElementById('calculate-btn');
  btn.disabled = true;
  btn.textContent = 'Calculating...';
  
  const trades = tradeRows.map(r => r.getData());
  
  const payload = {
    trades: trades,
    region_mapping: {
      north: document.getElementById('region-north').value,
      south: document.getElementById('region-south').value,
      east: document.getElementById('region-east').value
    },
    ilya_stock: document.getElementById('stock-all').checked,
    config: {
      ship_weight: parseInt(document.getElementById('ship-weight').value),
      char_weight: parseInt(document.getElementById('char-weight').value),
      char_used_weight: parseInt(document.getElementById('char-used-weight').value || 0),
      juggling: document.getElementById('juggling-toggle').checked
    }
  };
  
  try {
    const result = await planRoute(payload);
    
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = result.walkthrough;
    resultDiv.classList.add('show');
    resultDiv.classList.remove('hide-done');
    attachStepCheckboxes(resultDiv);
    
    const hideDoneToggle = document.getElementById('hide-done-toggle');
    const hideDoneCheckbox = document.getElementById('hide-done');
    if (hideDoneToggle && hideDoneCheckbox) {
      hideDoneToggle.style.display = 'flex';
      hideDoneCheckbox.checked = false;
    }
    
    clearRoute();
    drawRoute(result.stops || []);
    
    const distanceDisplay = document.getElementById('distance-display');
    distanceDisplay.textContent = `Total distance: ${(result.total_distance / 100).toFixed(1)}`;
    distanceDisplay.classList.add('show');
    
  } catch (err) {
    document.getElementById('result').textContent = 'Error: ' + err.message;
    document.getElementById('result').classList.add('show');
  }
  
  btn.disabled = false;
  btn.textContent = 'Calculate Route';
}

function populateTrades(trades) {
  const tbody = document.getElementById('trade-rows');
  tbody.innerHTML = '';
  tradeRows = [];
  (trades || []).forEach(trade => {
    const row = createTradeRow(trade);
    tbody.appendChild(row.element);
    tradeRows.push(row);
  });
}

const scanStore = { t4t5: [], t5t6: [], t6t7: [] };
let activeScanZone = 't4t5';

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function addScanImages(type, files) {
  for (const file of Array.from(files || [])) {
    if (!file.type.startsWith('image/')) continue;
    const data = await readBlobAsBase64(file);
    const name = file.name || (type === 't4t5' ? 't4t5.png' : 't5t6.png');
    scanStore[type].push({ name, type, data, mime: file.type });
  }
  renderScanList(type);
}

function renderScanList(type) {
  const list = document.getElementById(`drop-${type}-list`);
  if (!list) return;
  list.innerHTML = '';
  scanStore[type].forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'drop-item';
    const thumb = document.createElement('img');
    thumb.src = 'data:image/png;base64,' + img.data;
    const label = document.createElement('span');
    label.textContent = img.name;
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      scanStore[type].splice(i, 1);
      renderScanList(type);
    });
    item.append(thumb, label, rm);
    list.appendChild(item);
  });
}

function setupDropZone(type) {
  const zone = document.getElementById(`drop-${type}`);
  const input = document.getElementById(`scan-${type}`);
  if (!zone || !input) return;
  const activate = () => { activeScanZone = type; };
  zone.addEventListener('click', () => {
    activate();
    input.click();
  });
  zone.addEventListener('focusin', activate);
  zone.addEventListener('mouseenter', activate);
  input.addEventListener('change', () => {
    addScanImages(type, input.files);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addScanImages(type, e.dataTransfer.files);
  });
}

// Extract image files from a paste event. Falls back to navigator.clipboard.read()
// for cases (e.g. Snipping Tool) where clipboardData.items lacks an image entry.
async function getClipboardImages(e) {
  const files = [];
  if (e.clipboardData && e.clipboardData.items) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  }
  if (files.length) return files;
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            if (blob) files.push(blob);
          }
        }
      }
    }
  } catch (err) {
    // clipboard read requires focus/permission; ignore
  }
  return files;
}

async function scanScreenshots() {
  const images = [...scanStore.t4t5, ...scanStore.t5t6, ...scanStore.t6t7];
  if (scanStore.t4t5.length === 0 || scanStore.t5t6.length === 0) {
    alert('Please add at least one T4→T5 screenshot and one T5→T6 screenshot.');
    return;
  }
  const btn = document.getElementById('scan-btn');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  try {
    // In-browser OCR (tesseract.js) first; falls back to the local Python
    // /api/scan when it throws (e.g. tesseract CDN blocked, or 0 rows locally).
    let result = null;
    try {
      result = await clientScan(images);
    } catch (clientErr) {
      console.warn('In-browser OCR failed, trying local server:', clientErr);
    }
    if (!result || !result.trades || result.trades.length === 0) {
      try {
        const resp = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images })
        });
        const serverResult = await resp.json();
        if (!serverResult.error) result = serverResult;
      } catch (err) {
        console.warn('Local /api/scan unavailable:', err);
      }
    }
    if (result.error) {
      alert('Scan failed: ' + result.error);
      return;
    }
    populateTrades(result.trades || []);
    if (result.mapping) {
      if (result.mapping.north) document.getElementById('region-north').value = result.mapping.north;
      if (result.mapping.south) document.getElementById('region-south').value = result.mapping.south;
      if (result.mapping.east) document.getElementById('region-east').value = result.mapping.east;
    }
    alert(`Filled ${(result.trades || []).length} trade row(s) from the screenshots.`);
  } catch (err) {
    alert('Scan error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan & Fill Table';
  }
}

async function init() {
  try {
    catalog = await getCatalog();
  } catch (err) {
    console.error('Failed to load catalog:', err);
    document.getElementById('trade-rows').innerHTML = '<tr><td colspan="4" style="color: #a33;">Failed to load item data. Check browser console.</td></tr>';
    return;
  }
  
  populateTrades(DEFAULT_TRADES);
  initMapOverlay(map);
  
  document.getElementById('calculate-btn').addEventListener('click', calculateRoute);
  document.getElementById('scan-btn').addEventListener('click', scanScreenshots);
  setupDropZone('t4t5');
  setupDropZone('t5t6');
  setupDropZone('t6t7');
  document.addEventListener('paste', async (e) => {
    const files = await getClipboardImages(e);
    if (!files.length) return;
    e.preventDefault();
    addScanImages(activeScanZone, files);
  }, true);
  
  const hideDoneCheckbox = document.getElementById('hide-done');
  if (hideDoneCheckbox) {
    hideDoneCheckbox.addEventListener('change', () => {
      document.getElementById('result').classList.toggle('hide-done', hideDoneCheckbox.checked);
    });
  }

  const resultDiv = document.getElementById('result');
  resultDiv.addEventListener('activestep', (e) => {
    setActiveStep(e.detail && e.detail.step);
  });
}

document.addEventListener('DOMContentLoaded', init);
