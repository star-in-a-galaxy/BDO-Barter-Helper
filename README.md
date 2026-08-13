# BDO Bartering Helper

A web-based tool to optimize Black Desert Online bartering routes, with screenshot OCR to fill the trade table, inventory-aware route planning, and an interactive map that visualizes the solved route.

## Features

- **Trade Table**: Configure T4→T5→T6→T7 barter chains with filterable dropdowns
- **Screenshot Scanner**: OCR your in-game barter lists (T4→T5, T5→T6, optional T6→T7) to auto-fill the trade table and the T6→T7 region mapping. Runs **in the browser** (tesseract.js), so it works on GitHub Pages with no server.
- **Region Mapping**: Map North/South/East chains to T7 regions (A/B/C)
- **Ilya Stock**: Toggle assuming T5 stock at Ilya for all regions (zero-sum restock)
- **Inventory Weight Juggling**: Batch trips by juggling items between ship and player
- **Route Optimization**: Minimizes sailing distance (region chains, stock subsets, 2-opt refinement), respects the fixed East/South T6 trader order
- **Step-by-Step Walkthrough**: Numbered steps with per-step "done" checkboxes (prefix invariant) and region banners
- **Inventory Panel**: Live Boat/Player inventory overlay on the map (draggable), with item weights and overweight warning, tracking the current step
- **Interactive Map**: Leaflet map (bdolytics tiles) with calibrated barter-port markers (color-coded by tier), the solved route as numbered segments, and the active step highlighted as you complete steps

## Local Development

The app is a static site. Serve it locally:

```bash
# Python 3 (recommended — also serves the map tiles)
python serve.py

# Or any static server
python -m http.server 8000
npx serve .
npm run serve
```

Then open http://localhost:8000

Scanning runs entirely in the browser (tesseract.js from a CDN), the same on local and GitHub Pages — no server-side OCR.

### Running tests

```bash
npm install
npm test -- --run
```

## Deployment (GitHub Pages)

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that deploys the repo root to GitHub Pages on every push to `main`.

To enable:

1. Create a **public** GitHub repo and push this project to `main`.
2. In repo **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The site appears at `https://<username>.github.io/<repo-name>/`.

Everything runs client-side, so no backend is needed:

- Map tiles are static files under `tiles/`.
- OCR uses tesseract.js loaded from a CDN.
- Route optimization, calibration and markers are all in-browser JavaScript.
- The scanner is identical locally and on GitHub Pages.

### Manual deployment

Upload these to any static host:

- `index.html`
- `js/`, `assets/`, `static/`, `tiles/`

## Project Structure

```
bater_route/
├── index.html              # Main UI + map
├── js/
│   ├── app.js              # Main application logic / wiring
│   ├── catalog.js          # Item/location data loader
│   ├── optimizer.js        # Route optimizer (regions, stock, juggling, 2-opt)
│   ├── planner.js          # Route planner orchestrator (validates via Simulator)
│   ├── walkthrough.js      # Step-by-step walkthrough generator + done checkboxes
│   ├── inventory.js        # Boat/Player inventory tracking + panel rendering
│   ├── simulator.js        # Inventory simulation (ship/player/storage)
│   ├── scanner.js          # In-browser screenshot OCR + parsing (tesseract.js)
│   ├── map-overlay.js      # Map calibration, port markers, route overlay
│   ├── pako.min.js         # zlib (UPNG dependency)
│   └── upng.js             # Pure-JS PNG decode/encode (OCR preprocessing)
├── assets/
│   ├── barterGoods.json    # Item definitions
│   ├── barterPorts.json    # Port names + coordinates (used for map + distances)
│   ├── barterRoutes.json   # Barter route data
│   ├── barterTierPorts.json# Port-specific T6/T7 item lists
│   ├── barter_items/       # Source T6/T7 item lists (generate barterTierPorts.json)
│   └── icons/              # Item icon images (level_{tier}_{name}.webp)
├── static/                 # Leaflet library files
├── tiles/                  # Map tile images ({z}/{x}_{y}.webp, from bdolytics)
├── tests/                  # Vitest unit tests
├── serve.py                # Local dev server (static files + map tiles)
├── .github/workflows/      # GitHub Actions Pages deployment
└── .nojekyll               # Disables Jekyll on GitHub Pages
```

## Map calibration

The map tiles use BDO in-game coordinates projected onto a Leaflet `CRS.Simple` map. On first use (or after the tiles change), calibrate by clicking the **Calibrate Map** button and clicking three known ports on the map: **Iliya Island**, **Lema Island**, **Epheria Sentry Post**. The affine transform is solved from those clicks and saved to `localStorage`; a fitted default is used until then.

## Configuration

Defaults can be adjusted in the UI:

- **Region mapping**: North → A, South → B, East → C (T7 trade regions)
- **Free Ship Weight**: 22,450 lt
- **Character Weight Limit**: 5,500 lt
- **Character Used Weight**: 150 lt (threshold = limit × 1.7 − used)
- **Inventory Weight Juggling**: on
- **Assume T5 stock for all regions**: off

## Game Mechanics

- Trade conversions: T4→T5→T6→T7 (1:1 ratio)
- Item weights: T4/T5 = 1000lt, T6/T7 = 2000lt
- Trade caps: 6/5/5 per tier
- Parley budget: 90 trades max (1,000,000 / 11,000)
- Full chain: 15 trades per T5 item (5× each tier)
- 6 T5 items × 15 trades = 90 trades total

## License

MIT
