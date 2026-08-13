"""
Barter-list screenshot scanner.

OCRs T4→T5 and T5→T6 barter screenshots (see /verify) and turns them into
trade-table rows: { region, chain, t5, t4, island }.

Usage (CLI):
    python scanner.py verify/T4_T5_one.png verify/T4_T5_two.png verify/T5_T6.png
Outputs a JSON array of trade rows on stdout.

The item names in the screenshots are OCR'd and matched back to the known
catalog (assets/barterGoods.json) so the returned names are canonical.
"""

import json
import os
import re
import sys
from difflib import SequenceMatcher

from rapidocr_onnxruntime import RapidOCR

_ENGINE = None


def _get_engine():
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = RapidOCR()
    return _ENGINE


def ocr_boxes(path):
    """OCR an image -> list of {x0,y0,x1,y1,text,score} boxes."""
    result, _ = _get_engine()(path)
    boxes = []
    if not result:
        return boxes
    for box, text, score in result:
        pts = [(float(p[0]), float(p[1])) for p in box]
        boxes.append({
            'x0': min(p[0] for p in pts),
            'y0': min(p[1] for p in pts),
            'x1': max(p[0] for p in pts),
            'y1': max(p[1] for p in pts),
            'text': str(text).strip(),
            'score': float(score),
        })
    return boxes


def load_catalog():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'barterGoods.json'),
              encoding='utf-8') as f:
        return json.load(f)


def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def _name_part(s):
    """Item name without the [Level N] prefix, normalized, leading digits stripped."""
    s = re.sub(r'\[?level\s*\d+\]?\s*', '', s or '', flags=re.I)
    return re.sub(r'^\d+', '', norm(s))


def match_item(fragment, catalog, tier):
    """Match an OCR fragment to a catalog item of the given tier.

    Tries a prefix match first, then falls back to a fuzzy similarity match to
    tolerate OCR noise (e.g. "0" for "o", dropped letters).
    """
    target = _name_part(fragment)
    if len(target) < 3:
        return None
    candidates = [it['name'] for it in catalog if it.get('tier') == tier]
    # 1) prefix match (best/longest)
    best = None
    best_len = 0
    for name in candidates:
        n = _name_part(name)
        if n.startswith(target) and len(target) > best_len:
            best_len = len(target)
            best = name
    if best:
        return best
    # 2) fuzzy match
    best_ratio = 0.0
    best_name = None
    for name in candidates:
        n = _name_part(name)
        ratio = SequenceMatcher(None, target, n).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_name = name
    return best_name if best_ratio >= 0.78 else None


def _column_bands(boxes, left, middle, right):
    """Split boxes into left/middle/right columns by x ranges (inclusive)."""
    return {
        'left': [b for b in boxes if b['x0'] < left],
        'middle': [b for b in boxes if left <= b['x0'] < right],
        'right': [b for b in boxes if b['x0'] >= right],
    }


def _anchors(boxes):
    """Left-column rows: island / trader names (skip header + info lines)."""
    skip = ('exchanges', 'parley', 'total', 'all grades', 'lv.', 'grade')
    anchors = [b for b in boxes
               if b['x0'] < 260 and not b['text'].lower().startswith(skip)]
    anchors.sort(key=lambda b: b['y0'])
    # merge boxes that are clearly the same line (overlapping y)
    merged = []
    for b in anchors:
        if merged and abs(b['y0'] - merged[-1]['y0']) < 6:
            merged[-1]['text'] += ' ' + b['text']
        else:
            merged.append(dict(b))
    return merged


def _parse_rows(boxes, catalog, anchor, mid_tier, right_tier, mid_key, right_key, anchor_key):
    """Generic row parser anchored on left-column names.

    - anchor: left-column text that names the row (island or trader)
    - mid_tier/right_tier: catalog tiers for the middle/right columns
    - returns list of dicts keyed by anchor_key/mid_key/right_key
    """
    anchors = _anchors(boxes)
    rows = []
    for i, a in enumerate(anchors):
        lo = a['y0'] - 14
        hi = anchors[i + 1]['y0'] - 14 if i + 1 < len(anchors) else a['y0'] + 70
        mid_text = ' '.join(
            b['text'] for b in boxes
            if 260 <= b['x0'] < 640 and lo <= (b['y0'] + b['y1']) / 2 < hi
            and not b['text'].lower().startswith('parley')
        )
        right_text = ' '.join(
            b['text'] for b in boxes
            if b['x0'] >= 640 and lo <= (b['y0'] + b['y1']) / 2 < hi
        )
        rows.append({
            anchor_key: a['text'].strip(),
            mid_key: match_item(mid_text, catalog, mid_tier),
            right_key: match_item(right_text, catalog, right_tier),
        })
    return rows


def parse_t4t5(boxes, catalog):
    """Parse a T4→T5 screenshot -> list of {island, t4, t5} (canonical names)."""
    return _parse_rows(boxes, catalog, None, 'level_4', 'level_5', 't4', 't5', 'island')


def parse_t5t6(boxes, catalog):
    """Parse a T5→T6 screenshot -> list of {trader, t5, t6} (canonical names)."""
    return _parse_rows(boxes, catalog, None, 'level_5', 'level_6', 't5', 't6', 'trader')


# T6 trader -> (region, short chain name) as used by the trade table
CHAIN_MAP = {
    'starrymidnightport': ('South', 'Starry Midnight Port'),
    'grandiha': ('South', 'Grandiha'),
    'arehaza': ('East', 'Arehaza'),
    'hakovenisland': ('East', 'Hakoven Island'),
    'dallaepier': ('North', 'Dallae Pier'),
    'haemoisland': ('North', 'Haemo Island'),
}

# T7 port -> T7 region (A/B/C)
_PORT_TO_REGION = [
    ('sanctuarycoastaloutpost', 'A'),
    ('sausangarrisonwharf', 'A'),
    ('iliyaisland', 'B'),
    ('lemaisland', 'B'),
    ('olviacoast', 'C'),
    ('epheriasentrypost', 'C'),
]


def port_region(port):
    """Map an OCR'd T7 port name (may be truncated) to region A/B/C."""
    n = norm(port)
    for key, region in _PORT_TO_REGION:
        if key.startswith(n) or n.startswith(key):
            return region
    return None


def parse_t6t7(boxes, catalog):
    """Parse a T6→T7 screenshot -> list of {port, t6, t7} (canonical names)."""
    return _parse_rows(boxes, catalog, None, 'level_6', 'level_7', 't6', 't7', 'port')


def build_trades(t4t5_rows, t5t6_rows, t6t7_rows=None):
    """Join T4→T5 rows with T5→T6 rows on the T5 item -> trade table rows.

    Carries the real T6/T7 item names (when a T6→T7 screenshot was provided) so
    the optimizer can use them instead of the generic "[Level N] {Region}".
    """
    by_t5 = {}
    for r in t5t6_rows:
        if r['t5']:
            by_t5.setdefault(r['t5'], []).append(r)

    t6_to_t7 = {}
    if t6t7_rows:
        for r in t6t7_rows:
            if r.get('t6') and r.get('t7'):
                t6_to_t7.setdefault(norm(r['t6']), r['t7'])

    trades = []
    seen = set()
    for r in t4t5_rows:
        if not (r['t4'] and r['t5']):
            continue
        matches = by_t5.get(r['t5'], [])
        for m in matches:
            key = norm(r['t5']) + '|' + norm(m['trader'])
            if key in seen:
                continue
            seen.add(key)
            region, chain = CHAIN_MAP.get(norm(m['trader']), (None, None))
            if not region:
                continue
            trades.append({
                'region': region,
                'chain': chain,
                't5': r['t5'],
                't4': r['t4'],
                'island': r['island'],
                't6': m.get('t6'),
                't7': t6_to_t7.get(norm(m['t6'])) if m.get('t6') else None,
            })
    return trades


def scan_mapping(t5t6_rows, t6t7_rows):
    """Infer the T6→T7 region mapping (north/south/east -> A/B/C) by joining the
    T6 items from the T5→T6 screenshot with the T7 ports in the T6→T7 screenshot."""
    t6_to_region = {}
    for r in t6t7_rows:
        region = port_region(r.get('port', ''))
        if region and r.get('t6'):
            t6_to_region.setdefault(norm(r['t6']), region)

    result = {}
    for r in t5t6_rows:
        region, _ = CHAIN_MAP.get(norm(r.get('trader', '')), (None, None))
        if not region or not r.get('t6'):
            continue
        mapping = t6_to_region.get(norm(r['t6']))
        if not mapping:
            continue
        key = region.lower()
        cur = result.get(key)
        if cur is None:
            result[key] = mapping
        elif cur != mapping:
            result[key] = None  # inconsistent between sources
    return {k: v for k, v in result.items() if v}


def scan(t4t5_paths, t5t6_path, t6t7_path=None, catalog=None):
    catalog = catalog or load_catalog()
    t4t5_rows = []
    for p in t4t5_paths:
        t4t5_rows += parse_t4t5(ocr_boxes(p), catalog)
    t5t6_rows = parse_t5t6(ocr_boxes(t5t6_path), catalog)
    mapping = {}
    t6t7_rows = []
    if t6t7_path:
        t6t7_rows = parse_t6t7(ocr_boxes(t6t7_path), catalog)
        mapping = scan_mapping(t5t6_rows, t6t7_rows)
    return {
        'trades': build_trades(t4t5_rows, t5t6_rows, t6t7_rows),
        'mapping': mapping,
    }


if __name__ == '__main__':
    args = sys.argv[1:]
    # Usage: python scanner.py T4_T5.png... T5_T6.png [T6_T7.png]
    if len(args) < 2:
        print('usage: python scanner.py <t4t5.png>... <t5t6.png> [<t6t7.png>]', file=sys.stderr)
        sys.exit(1)
    t5t6_path = args[-2] if len(args) >= 3 else args[-1]
    t6t7_path = args[-1] if len(args) >= 3 else None
    t4t5_paths = args[:-2] if len(args) >= 3 else args[:-1]
    result = scan(t4t5_paths, t5t6_path, t6t7_path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
