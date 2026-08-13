# BDO Bartering Helper

A web-based tool to optimize Black Desert Online bartering routes with inventory management and step-by-step walkthroughs.

## Features

- **Trade Table**: Configure T4→T5 trades with filterable dropdowns
- **Region Mapping**: Map North/South/East chains to T7 regions (A/B/C)
- **Ilya Stock**: Toggle pre-loading T5 items from Ilya storage
- **Route Optimization**: Calculates optimal sailing distance
- **Step-by-Step Walkthrough**: Detailed instructions for each stop
- **Interactive Map**: Visualize routes on Leaflet tile map

## Local Development

Serve the static site locally:

```bash
# Python 3 (recommended)
python serve.py

# Or use Python's built-in server
python -m http.server 8000

# Node.js
npx serve .

# Or use the included npm script
npm run serve
```

Then open http://localhost:8000

## Deployment

### GitHub Pages (Automatic)

The repository includes a GitHub Actions workflow that automatically deploys to GitHub Pages when you push to `main` or `master`.

To enable:
1. Go to repository Settings → Pages
2. Under "Source", select "GitHub Actions"
3. Push to main/master branch
4. The site will be available at `https://<username>.github.io/<repo-name>/`

### Manual Deployment

The app is fully static. Upload these files/directories to any web server:
- `index.html`
- `js/` directory
- `assets/` directory
- `static/` directory
- `tiles/` directory (map tiles)

## Project Structure

```
bater_route/
├── index.html              # Main UI
├── js/                     # JavaScript modules
│   ├── app.js             # Main application logic
│   ├── catalog.js         # Item/location data loader
│   ├── distance.js        # Distance calculations
│   ├── route-builder.js   # Route sequence builder
│   ├── walkthrough.js     # Text walkthrough generator
│   ├── simulator.js       # Inventory simulation
│   └── planner.js         # Route planner orchestrator
├── assets/
│   ├── barterGoods.json   # Item definitions with icons
│   ├── barterPorts.json   # Port locations and coordinates
│   └── icons/             # Item icon images
├── static/                 # Leaflet library files
├── tiles/                  # Tile map images
├── serve.py               # Local development server
└── .github/workflows/     # GitHub Actions deployment
```

## Configuration

Default values can be adjusted in the UI:
- **Base Parley**: 1,000,000 (total parley budget)
- **Parley per Trade**: 11,000 (cost per trade)
- **Ship Weight**: 22,450 lt (ship capacity)
- **Character Available**: 5,000 lt (character capacity, ×2 with overstack)

## Game Mechanics

- Trade conversions: T4→T5→T6→T7 (1:1 ratio)
- Item weights: T4/T5 = 1000lt, T6/T7 = 2000lt
- Trade caps: 6/5/5 per tier
- Parley budget: 90 trades max (1,000,000 / 11,000)
- Full chain: 15 trades per T5 item (5× each tier)
- 6 T5 items × 15 trades = 90 trades total

## License

MIT
