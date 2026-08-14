# BDO Bartering Helper - Usage Guide

This tool turns your in-game **barter screenshots** into an optimized sailing route:
it scans the trade lists, fills the trade table, plans the route (minimizing real
sea distance), and gives you a step-by-step walkthrough with a live inventory
panel and a map that draws the actual sailing path.

All scanning, planning and rendering run **entirely in your browser** - nothing
is uploaded.

## Quick start

1. **Take screenshots** of your barter lists (see below) and drag & drop them
   into the matching drop zones (or paste with Ctrl+V).
2. Press **Scan & Fill Table** - the trade table is filled automatically.
3. Optionally tweak the **T6 → T7 region mapping** if you did not upload the T6->T7 trades. If you did, it resolves by itself.
4. Press **Calculate Route**.
5. Follow the numbered walkthrough, ticking each step's checkbox as you go -
   the map and the inventory panel follow along.


## Step 1 - Take & scan screenshots

Open the barter window in-game and screenshot the trade lists. The scanner
reads three kinds: the **T4 → T5** island trades, the **T5 → T6** trades,
and **T6 → T7** trades.

> Keep the **port / trader names** visible in every screenshot, and crop the
> screenshots **as tight as possible** - the scanner reads those names to
> identify each trade, so don't crop them out.

> **Multiple screenshots per step are fine.** The **T4 → T5** section usually has more
> than six island trades that rarely fit on one screen, so it's more than okay to take
> several screenshots. Just drop them all into the same drop zone.

Example inputs:

**T4 → T5 example**
![T4→T5 example](docs/images/T4_T5_one.png)
**T5 → T6 example**
![T5→T6 example](docs/images/T5_T6.png)

## Step 2 - Scan & Fill Table

Drop or paste the screenshots into the matching drop zones, then press
**Scan & Fill Table** - the trade table is filled automatically.

If the scanner can't decide between two similar items, a dialog asks you to
pick the correct one. With the example screenshots this only happens between
![Marine Knights' Helm](docs/images/level_4_marine_knights_helm.webp) **Marine Knights' Helm** 
and ![Marine Knights' Spear](docs/images/level_4_marine_knights_spear.webp) **Marine Knights' Spear** 
(two near-identical names OCR can easily confuse) - just pick the one shown on
your screenshot.

## Step 3 - Check the trade table

After scanning, each chain row shows which **T5 item** you'll receive and which
**T4 item** to bring. Every cell is a filterable dropdown, so you can correct or
hand-edit anything.

- **Clear Screenshots** - removes the pending screenshots from the drop zones.
- **Clear Table** - blanks all rows (T5 / T4 / Island) back to empty.

## Step 4 - Configure

- **T6 → T7 Region Mapping** - each T6 chain (North / South / East) resolves at one of these T7 regions:
   - **A** = Olvia Coast + Epheria Sentry Post
   - **B** = Iliya Island + Lema Island
   - **C** = Sanctuary Coastal Outpost + Sausan Garrison Wharf
- Defaults: North → A, South → B, East → C.
- **Assume T5 stock for all regions** - if you pre-load T5 items from Iliya,
  enable this; the planner still produces a zero-sum route (it restocks).
- **Free Ship Weight / Character Weight Limit / Character Used Weight** - your
  actual capacities. The player's usable limit is `limit × 1.7 − used`.
- **Inventory Weight Juggling** - batch trips by juggling items between ship
  and player (recommended on).

## Step 5 - Calculate the route

Press **Calculate Route**. The planner evaluates many region/stock/ordering
combinations, validates each against an inventory simulator, and picks the
shortest **real sea distance** (the path goes around the landmass, not straight
through it). The result shows the total distance and a numbered walkthrough.

## Step 6 - Follow the walkthrough

- Each step is a port with its actions (**Load / Barter / Swap / Store / Sell**).
- Tick the **done** checkbox as you complete a step - earlier steps are always
  done before later ones, and the map highlights the **current + next**.
- The **Player & Boat inventory** panel (draggable, bottom-left of the map)
  shows what you should be carrying and the current weight vs. capacity
  (including an **overweight** warning when over).
- The map draws the **sailing path** through the sea lanes; markers are
  color-coded by tier (T5 / T6 / T7).

## Common questions

Question: **"Why does my OCR not work?** 
<br>
Answer: Please check that all the necesasry information is on your screenshot: Port, Source Item, and Target Item. You will also have to make sure that it is uploaded in the correct region.

Question: **Why is OCR so slow?**
<br>
Answer: OCR runs entirely in your browser, so speed depends on your computer. The very first scan also downloads the OCR engine and language data.

Question: **Why does the route look like it cuts across land?** 
<br>
Answer: The routes are approximations. A little crossing is fine and won't significantly change the  optimizer's choice.

Question: **Does this find the optimal solution?** 
<br>
Answer: Most likely not, however it gives a very good approximation of the optimal route.

