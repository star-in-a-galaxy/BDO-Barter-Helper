import { getCatalog } from './catalog.js';
import { planRoute } from './planner.js';
import { attachStepCheckboxes, getActiveCard, getInventoryForCard, stepNext, stepPrev } from './walkthrough.js';
import { formatInventory } from './inventory.js';
import { initMapOverlay, drawRoute, clearRoute, setActiveStep, setAheadSteps } from './map-overlay.js';
import { scanImages as clientScan } from './scanner.js';

let catalog = null;
let tradeRows = [];

// Fixed row order: the 6 chains, always shown (scanned values fill in where
// found; missing chains stay blank).
const DEFAULT_TRADES = [
  { region: 'North', chain: 'Dallae Pier' },
  { region: 'North', chain: 'Haemo Island' },
  { region: 'South', chain: 'Grandiha' },
  { region: 'South', chain: 'Starry Midnight Port' },
  { region: 'East', chain: 'Hakoven Island' },
  { region: 'East', chain: 'Arehaza' }
];

function normChainName(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

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
    // Icon paths in the data are absolute ("/assets/icons/..."), which break
    // under a GitHub Pages repo sub-path - make them relative like the rest of
    // the app's asset references.
    return typeof opt === 'object' && opt.icon ? String(opt.icon).replace(/^\//, '') : null;
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
      updateSelectedIcon();
    }
  };
}

function createTradeRow(trade) {
  const row = document.createElement('tr');
  
  const regionCell = document.createElement('td');
  regionCell.textContent = `${trade.region} ${trade.chain}`;
  regionCell.style.fontWeight = 'bold';
  regionCell.style.color = '#5a9';

  let warnBadge = null;
  const renderWarnings = () => {
    if (warnBadge) { warnBadge.remove(); warnBadge = null; }
    if (trade.warnings && trade.warnings.length) {
      warnBadge = document.createElement('span');
      warnBadge.className = 'scan-warning';
      warnBadge.textContent = '⚠ verify';
      warnBadge.title = trade.warnings
        .map(w => `${w.field}: "${w.item}"\n  OCR read: ${w.read}\n  could also be: ${w.alternatives.join(', ')}`)
        .join('\n\n');
      regionCell.appendChild(warnBadge);
    }
  };
  renderWarnings();
  
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
    chain: trade.chain, // for lookup in the resolution modal
    getData: () => ({
      region: trade.region,
      chain: `${trade.region} - ${trade.chain}`,
      t5: t5Dropdown.getValue(),
      t4: t4Dropdown.getValue(),
      island: islandDropdown.getValue(),
      t6: trade.t6,
      t7: trade.t7,
      t7Port: trade.t7Port
    }),
    // Resolve an ambiguity: set the field to the chosen option.
    setValue: (field, value) => {
      if (field === 't5') t5Dropdown.setValue(value);
      else if (field === 't4') t4Dropdown.setValue(value);
      else if (field === 'island') islandDropdown.setValue(value);
      else if (field === 't6') trade.t6 = value;
      else if (field === 't7') trade.t7 = value;
      else if (field === 't7Port') trade.t7Port = value;
    },
    clearWarnings: () => {
      trade.warnings = undefined;
      renderWarnings();
    }
  };
}

async function calculateRoute() {
  const btn = document.getElementById('calculate-btn');
  btn.disabled = true;
  btn.textContent = 'Calculating...';
  
  // Skip rows that were never filled (scan found nothing for that chain).
  const trades = tradeRows.map(r => r.getData()).filter(t => t.t5 && t.t4);
  
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
    updateInventoryPanel();
    
    const routeToolbar = document.getElementById('route-toolbar');
    const hideDoneCheckbox = document.getElementById('hide-done');
    if (routeToolbar) {
      routeToolbar.style.display = 'flex';
      if (hideDoneCheckbox) hideDoneCheckbox.checked = false;
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
  const byChain = new Map();
  (trades || []).forEach(t => {
    const key = normChainName(t.chain);
    if (!byChain.has(key)) byChain.set(key, t);
  });
  // Always render all 6 rows in the fixed order; fill from the scan where the
  // chain was recognized, leave the rest blank.
  DEFAULT_TRADES.forEach(base => {
    const scanned = byChain.get(normChainName(base.chain));
    const row = createTradeRow({
      region: base.region,
      chain: base.chain,
      t5: scanned ? scanned.t5 : undefined,
      t4: scanned ? scanned.t4 : undefined,
      island: scanned ? scanned.island : undefined,
      t6: scanned ? scanned.t6 : undefined,
      t7: scanned ? scanned.t7 : undefined,
      t7Port: scanned ? scanned.t7Port : undefined,
      warnings: scanned ? scanned.warnings : undefined
    });
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

// Clear all pending screenshots from every scan zone.
function clearScreenshots() {
  for (const type of ['t4t5', 't5t6', 't6t7']) {
    scanStore[type] = [];
    renderScanList(type);
  }
}

// Clear every trade row's T5/T4/Island (and any scanned T6/T7) back to blank.
function clearTradeTable() {
  tradeRows.forEach(row => {
    row.setValue('t5', '');
    row.setValue('t4', '');
    row.setValue('island', '');
    row.setValue('t6', undefined);
    row.setValue('t7', undefined);
    row.clearWarnings();
  });
}

// --- Usage guide -----------------------------------------------------------

const mdEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function mdInline(s) {
  return mdEscape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
      `<img class="guide-img" src="${src}" alt="${alt}" loading="lazy" onerror="this.style.display='none'">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// Minimal markdown -> HTML for the usage guide (headings, lists with wrapped
// continuation lines, code blocks, paragraphs, inline code/bold/images/links).
function mdToHtml(md) {
  const blocks = md.split(/\n\s*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const first = lines[0].trim();
    if (first.startsWith('```')) {
      const body = lines.slice(1);
      if (body.length && body[body.length - 1].trim() === '```') body.pop();
      out.push(`<pre><code>${mdEscape(body.join('\n'))}</code></pre>`);
      continue;
    }
    const h = first.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${mdInline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*([-*]|\d+[.)])\s+/.test(first)) {
      out.push(mdList(lines));
      continue;
    }
    if (first.startsWith('>')) {
      out.push(`<blockquote>${mdParagraph(lines.map(l => l.replace(/^\s*>\s?/, '')))}</blockquote>`);
      continue;
    }
    out.push(`<p>${mdParagraph(lines)}</p>`);
  }
  return out.join('\n');
}

// Join text lines with a space, but a line ending in two spaces is a hard
// line break (rendered as <br>), and a line that is just `<br>` also becomes a
// line break (e.g. to separate a Question from its Answer).
function mdParagraph(lines) {
  let html = '';
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^<br\s*\/?>$/i.test(t)) { html += '<br>'; continue; }
    const hard = / {2,}$/.test(raw);
    const piece = mdInline(t.replace(/ {2,}$/, ''));
    html += (html && !hard ? ' ' : '') + piece + (hard ? '<br>' : '');
  }
  return html;
}

// Render a list block, honoring indentation so nested bullets become nested
// <ul>/<ol>. Continuation lines (not starting with a bullet) wrap onto the
// previous item's text; a line ending in two spaces forces a <br>.
function mdList(lines) {
  const nodes = [];
  for (const raw of lines) {
    const m = raw.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/);
    if (m) {
      const content = m[3];
      const hard = / {2,}$/.test(content);
      nodes.push({
        indent: m[1].replace(/\t/g, '  ').length,
        ordered: /^\d/.test(m[2]),
        html: mdInline(content.replace(/ {2,}$/, '')) + (hard ? '<br>' : ''),
        children: []
      });
    } else if (raw.trim() && nodes.length) {
      const t = raw.trim();
      if (/^<br\s*\/?>$/i.test(t)) {
        nodes[nodes.length - 1].html += '<br>';
        continue;
      }
      const hard = / {2,}$/.test(raw);
      const piece = mdInline(t.replace(/ {2,}$/, ''));
      const node = nodes[nodes.length - 1];
      node.html += (hard ? '' : ' ') + piece + (hard ? '<br>' : '');
    }
  }
  const root = { children: [] };
  const stack = [{ indent: -1, children: root.children }];
  for (const node of nodes) {
    while (stack.length > 1 && node.indent <= stack[stack.length - 1].indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const render = (children) => {
    if (!children.length) return '';
    let html = '';
    for (let i = 0; i < children.length;) {
      const type = children[i].ordered;
      let j = i;
      while (j < children.length && children[j].ordered === type) j++;
      html += `<${type ? 'ol' : 'ul'}>`;
      for (let k = i; k < j; k++) {
        html += `<li>${children[k].html}${render(children[k].children)}</li>`;
      }
      html += `</${type ? 'ol' : 'ul'}>`;
      i = j;
    }
    return html;
  };
  return render(root.children);
}

function setupGuideModal() {
  const btn = document.getElementById('usage-guide-btn');
  const modal = document.getElementById('guide-modal');
  const closeBtn = document.getElementById('guide-close');
  const body = document.getElementById('guide-body');
  if (!btn || !modal || !closeBtn || !body) return;

  const close = () => { modal.style.display = 'none'; };
  btn.addEventListener('click', async () => {
    try {
      const res = await fetch('docs/Instructions.md');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body.innerHTML = mdToHtml(await res.text());
    } catch (e) {
      body.innerHTML = '<p>Could not load the usage guide (docs/Instructions.md).</p>';
    }
    modal.style.display = 'flex';
  });
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

function renderScanList(type) {
  const list = document.getElementById(`drop-${type}-list`);
  if (!list) return;
  list.innerHTML = '';
  scanStore[type].forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'drop-item';
    const thumb = document.createElement('img');
    thumb.src = dataUrlFor(img);
    thumb.title = 'Click to view full size';
    thumb.addEventListener('click', (e) => {
      e.stopPropagation();
      openZoomModal(img);
    });
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

function dataUrlFor(img) {
  return 'data:' + (img.mime || 'image/png') + ';base64,' + img.data;
}

// Open a full-size view of a scanned screenshot in a modal.
function openZoomModal(img) {
  const modal = document.getElementById('zoom-modal');
  const title = document.getElementById('zoom-title');
  const body = document.getElementById('zoom-body');
  if (!modal || !body) return;
  title.textContent = img.name || 'Screenshot';
  body.innerHTML = '';
  const big = document.createElement('img');
  big.src = dataUrlFor(img);
  body.appendChild(big);
  modal.style.display = 'flex';
}

function setupZoomModal() {
  const modal = document.getElementById('zoom-modal');
  const closeBtn = document.getElementById('zoom-close');
  if (!modal || !closeBtn) return;
  const close = () => { modal.style.display = 'none'; };
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
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

// Item icon <img> for a "[Level N] Item Name" string (mirrors walkthrough.js).
function itemIconImg(itemName) {
  const tierMatch = String(itemName).match(/\[Level (\d)\]/);
  const tier = tierMatch ? tierMatch[1] : '';
  const safe = String(itemName).replace(/\[Level \d+\]\s*/, '').toLowerCase()
    .replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `<img src="assets/icons/level_${tier}_${safe}.webp" alt="" width="26" height="26" style="vertical-align:middle;margin-right:8px;" onerror="this.style.display='none'">`;
}

// Modal that walks through every unique scan ambiguity (near-twin items) and
// asks the user to pick which item is right. The same ambiguity can appear in
// several rows/trades (e.g. a T6 item seen in both the T5→T6 and T6→T7 scans),
// so it is asked once and the chosen answer is applied to all of them.
// Returns true if it opened a modal.
function openResolutionModal(trades) {
  const groups = new Map();
  (trades || []).forEach((trade) => {
    // Find the rendered row by chain (the table is always in the fixed order,
    // which doesn't match the scan's output order).
    const row = tradeRows.find(r => normChainName(r.chain) === normChainName(trade.chain));
    if (!row) return;
    (trade.warnings || []).forEach(w => {
      const key = `${w.field}|${w.item}|${(w.alternatives || []).join('|')}`;
      if (!groups.has(key)) groups.set(key, { w, targets: [] });
      groups.get(key).targets.push({ trade, row });
    });
  });
  if (!groups.size) return false;

  const queue = [...groups.values()];

  const modal = document.getElementById('resolve-modal');
  const body = document.getElementById('resolve-body');
  const title = document.getElementById('resolve-title');
  const progress = document.getElementById('resolve-progress');
  const closeBtn = document.getElementById('resolve-close');
  modal.style.display = 'flex';

  const close = () => { modal.style.display = 'none'; };
  closeBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  let i = 0;
  const show = () => {
    if (i >= queue.length) { close(); return; }
    const { w, targets } = queue[i];
    const trade = targets[0].trade;
    progress.textContent = `Resolving ${i + 1} of ${queue.length}`;
    title.textContent = 'Resolve scan uncertainty';
    body.innerHTML = '';

    const context = document.createElement('div');
    context.className = 'resolve-context';
    // Name the port where the item is used (the island for T4/T5 give/receive).
    const where = (w.field === 't4' || w.field === 't5') ? (trade.island || '') : '';
    const route = `${trade.region} ${trade.chain}`;
    context.textContent = where ? `${route} - ${where}` : route;
    body.appendChild(context);

    const field = document.createElement('div');
    field.className = 'resolve-field';
    const tier = (String(w.item).match(/\[Level (\d)\]/) || [])[1] || '';
    field.textContent = `Source Level: ${tier} - OCR ambiguity, please pick the correct item`;
    body.appendChild(field);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'resolve-options';

    if (w.kind === 'trader') {
      // The T5 was read at more than one trader (one read is a misread). Let the
      // user pick the correct chain rather than silently keeping the first.
      field.textContent = `"${w.item}" was read at more than one trader - pick the correct chain`;
      const opts = [
        { label: `${trade.region} ${trade.chain}`, candidate: null },
        ...(trade.alternativeTraders || []).map(a => ({ label: `${a.region} ${a.chain}`, candidate: a }))
      ];
      opts.forEach(o => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'resolve-option trader-opt' + (o.candidate === null ? ' current' : '');
        const sub = o.candidate
          ? ` → ${o.candidate.t6 || '?'} → ${o.candidate.t7 || '?'} @ ${o.candidate.t7Port || '?'}`
          : ` → ${trade.t6 || '?'} → ${trade.t7 || '?'} @ ${trade.t7Port || '?'}`;
        btn.innerHTML = `<span>${o.label}</span><span class="resolve-sub">${sub}</span>`;
        btn.title = o.candidate === null ? 'Keep the matched chain' : 'Use this chain instead';
        btn.addEventListener('click', () => {
          const curRow = targets[0].row;
          if (o.candidate) {
            const chosenRow = tradeRows.find(r => normChainName(r.chain) === normChainName(o.candidate.chain)) || curRow;
            chosenRow.setValue('t5', trade.t5);
            chosenRow.setValue('t4', trade.t4);
            chosenRow.setValue('island', trade.island);
            chosenRow.setValue('t6', o.candidate.t6);
            chosenRow.setValue('t7', o.candidate.t7);
            chosenRow.setValue('t7Port', o.candidate.t7Port);
            if (chosenRow !== curRow) {
              curRow.setValue('t5', '');
              curRow.setValue('t4', '');
              curRow.setValue('island', '');
              curRow.setValue('t6', undefined);
              curRow.setValue('t7', undefined);
              curRow.setValue('t7Port', undefined);
            }
          }
          i++;
          show();
        });
        optionsWrap.appendChild(btn);
      });
    } else {
      const options = [w.item, ...w.alternatives];
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'resolve-option' + (opt === w.item ? ' current' : '');
        btn.innerHTML = itemIconImg(opt) + `<span>${opt}</span>`;
        btn.title = opt === w.item ? 'Keep the matched item' : 'Choose this alternative';
        btn.addEventListener('click', () => {
          for (const { row } of targets) {
            row.setValue(w.field, opt);
            row.clearWarnings();
          }
          i++;
          show();
        });
        optionsWrap.appendChild(btn);
      });
    }
    body.appendChild(optionsWrap);
  };

  show();
  return true;
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
    // In-browser OCR (tesseract.js) only - the same path as GitHub Pages.
    const result = await clientScan(images);
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
    const trades = result.trades || [];
    const openedModal = openResolutionModal(trades);
    if (!openedModal) {
      alert(trades.length
        ? `Filled ${trades.length} trade row(s) from the screenshots.`
        : 'No trades were recognized from the screenshots. Check that they show the barter list clearly, and that tesseract.js loaded (needs internet).');
    }
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
  makeDraggable(document.getElementById('inv-controls'));
  positionInventoryDefault();
  const invPrev = document.getElementById('inv-prev');
  const invNext = document.getElementById('inv-next');
  const resultDivForNav = document.getElementById('result');
  if (invPrev) invPrev.addEventListener('click', () => stepPrev(resultDivForNav));
  if (invNext) invNext.addEventListener('click', () => stepNext(resultDivForNav));
  
  document.getElementById('calculate-btn').addEventListener('click', calculateRoute);
  document.getElementById('scan-btn').addEventListener('click', scanScreenshots);
  document.getElementById('clear-scan-btn').addEventListener('click', clearScreenshots);
  document.getElementById('clear-table-btn').addEventListener('click', clearTradeTable);
  setupGuideModal();
  setupZoomModal();
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
    updateInventoryPanel();
  });

  // How many steps ahead to highlight on the map (default 1 = current + next).
  const stepsAhead = document.getElementById('steps-ahead');
  if (stepsAhead) {
    setAheadSteps(parseInt(stepsAhead.value, 10) || 1);
    stepsAhead.addEventListener('change', () => setAheadSteps(parseInt(stepsAhead.value, 10) || 0));
  }
}

// Show the current step's boat/player inventory in the map overlay panel.
function updateInventoryPanel() {
  const panel = document.getElementById('inv-controls');
  const body = document.getElementById('inv-body');
  const portEl = document.querySelector('#inv-controls .inv-port');
  if (!panel || !body) return;
  const card = getActiveCard(document.getElementById('result'));
  if (!card) {
    panel.style.display = 'none';
    body.innerHTML = '';
    if (portEl) portEl.textContent = '';
    return;
  }
  const inv = getInventoryForCard(card);
  if (!inv) {
    panel.style.display = 'none';
    if (portEl) portEl.textContent = '';
    return;
  }
  const portName = card.querySelector('.port-header strong');
  if (portEl) portEl.textContent = (portName && portName.textContent) || '';
  body.innerHTML = formatInventory(inv.before, inv.after, inv.swapped, {
    shipMax: inv.shipMax,
    playerMax: inv.playerMax,
    playerUsedWeight: inv.playerUsedWeight,
    playerWeightLimit: inv.playerWeightLimit
  });
  panel.style.display = '';

  // Enable/disable step navigation based on the current position.
  const cards = Array.from(document.getElementById('result').querySelectorAll('.port-card'));
  const idx = cards.indexOf(card);
  const prevBtn = document.getElementById('inv-prev');
  const nextBtn = document.getElementById('inv-next');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx < 0 || idx >= cards.length - 1;
}

// Place the inventory panel directly below the map-layers panel by default
// (the user can still drag it elsewhere).
function positionInventoryDefault() {
  const panel = document.getElementById('inv-controls');
  const layers = document.getElementById('map-controls');
  const wrap = document.getElementById('map-wrap');
  if (!panel || !layers || !wrap) return;
  const below = layers.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 10;
  panel.style.top = below + 'px';
  panel.style.left = '10px';
  panel.style.bottom = 'auto';
}

// Let the inventory panel be dragged around the map (drag by its title bar).
function makeDraggable(el) {
  if (!el) return;
  const handle = el.querySelector('.inv-drag');
  if (!handle) return;
  let dragging = false, offX = 0, offY = 0;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    offX = e.clientX - el.getBoundingClientRect().left;
    offY = e.clientY - el.getBoundingClientRect().top;
    handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const wrap = el.offsetParent || el.parentElement;
    const wr = wrap.getBoundingClientRect();
    let left = e.clientX - wr.left - offX;
    let top = e.clientY - wr.top - offY;
    left = Math.max(0, Math.min(left, wr.width - el.offsetWidth));
    top = Math.max(0, Math.min(top, wr.height - el.offsetHeight));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.bottom = 'auto';
  });
  const stop = () => { dragging = false; };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

document.addEventListener('DOMContentLoaded', init);
