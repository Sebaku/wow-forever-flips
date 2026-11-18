# Forever Flips

Vendor flip calculator for **World of Warcraft: Forever** (EU). It lists every craftable recipe ranked by **vendor profit per hour**: buy reagents from the auction house, craft, and sell the output to a vendor.

Built with Next.js 16 (App Router, Cache Components), React 19, TypeScript and Tailwind CSS 4.

## Running

```bash
npm install
npm run data      # rebuild data/crafts.json (item + recipe data)
npm run dev       # http://localhost:3000
```

```bash
npm run lint
npm run typecheck
npm run build
```

## Modes

- **Buy mats** (`/`) — buy every reagent from the auction house, craft, sell to a vendor.
- **Self-craft mats** (`/self-craft`) — recursively craft intermediate reagents first. For each reagent the calculator picks whichever is cheaper: its cheapest recipe (including the cast time of every sub-craft) or buying it. Rows that only become profitable when you craft the intermediates are marked **self-craft only**.

The dashboard also reports how many recipes are profitable only by self-crafting, and each expanded row compares the selected mode against the other one.

## How profit is calculated

- Vendor payout = output vendor `SellPrice` × recipe output count.
- Reagent unit cost = EU market value (falls back to historical value). The vendor `BuyPrice` is used only when the item has no auction data and ForeverDB knows an NPC that sells it — `BuyPrice` alone is not proof of a vendor source.
- A recipe is skipped when a reagent has neither an auction price nor a real vendor price.
- Craft time = longest of cast time, cooldown, and a 1.5 s global-cooldown floor.
- Profit per hour = (vendor payout − reagent cost) ÷ craft time × 3600.
- Cooldown-bound recipes (e.g. transmutes) assume one craft per cooldown.

Prices come from TradeSkillMaster's public Forever EU region data and are cached on the server for 15 minutes.

## Data pipeline

`npm run data` regenerates `data/crafts.json` from:

- **ForeverDB addon data** (`Recipes.lua`, `Items.lua`) — Forever recipe list, output counts (including random counts), reagents and which items NPC vendors actually sell. Data from [ForeverDB.net](https://foreverdb.net), reused under GPL-3.0 with its attribution term.
- **wago.tools DB2 exports** — Forever `ItemSparse` (item names, vendor prices, quality), plus `SpellMisc`, `SpellCastTimes` and `SpellCooldowns` for cast times and cooldowns.
- **Classic Era `ItemSparse`** as a fallback for items that are present in the Forever client's recipes but missing from its `ItemSparse` export. Forever rows always take precedence; fallback rows use Classic Era vendor prices.

Item and recipe data are bundled into the app. Auction prices are fetched at runtime.

### Optional: ForeverDB API key

The public addon data is enough to build the site. Items hidden from the Forever `ItemSparse` export can be resolved with a ForeverDB API key, which removes most `~` estimates and recovers the recipes that would otherwise be excluded:

1. Log in with Battle.net at <https://foreverdb.net/developers> and request access. Describe the project, give an email address, and agree to credit ForeverDB.net.
2. After approval, create a key in your account (up to 3).
3. Add `FDB_API_KEY=fdb_...` to `.env.local` (ignored by git).
4. Run `npm run data` again. The script fetches one item at a time at the free-tier rate (30/min, 5,000/day), caches responses in `.cache/fdb-api/` for 7 days, and marks resolved items `src: "api"`.

The key is read only by the build script; it is never bundled into the app. The free tier requires the visible ForeverDB.net credit, which the footer already shows. Set `FDB_REFRESH=1` to ignore the 7-day cache.

### Known gaps

- Without an API key, 78 recipes reference output items that exist in neither the Forever nor the Classic Era `ItemSparse` export (mostly new Forever items), so they are excluded.
- Without an API key, 204 recipes use Classic Era vendor prices for their output because the Forever `ItemSparse` export is missing the item (the item still exists in the Forever `Item` table). They are marked `~` in the table. 12 reagent item IDs use the same fallback (212 item records in total).
- Rogue poisons are not in ForeverDB's recipe data yet and are not included.
- Reagents are priced from the auction house. A vendor price is used only when no auction data exists and the item is sold by an NPC, so unlimited vendor supplies are never assumed.

## Attribution

- Recipe and item data: [ForeverDB.net](https://foreverdb.net) — "Data from ForeverDB.net", GPL-3.0 section 7(b).
- Client tables: [wago.tools](https://wago.tools).
- Auction house prices: TradeSkillMaster public data.

World of Warcraft is a trademark of Blizzard Entertainment. This project is not affiliated with Blizzard Entertainment.
