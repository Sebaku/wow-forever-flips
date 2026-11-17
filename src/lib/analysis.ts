import type { Analysis, CraftsData, FlipRow, Prices, ReagentCost } from "./types";

const MIN_CRAFT_SECONDS = 1.5;

export function analyze(data: CraftsData, prices: Prices): Analysis {
  const rows: FlipRow[] = [];
  let excludedMissingPrice = 0;
  let priceUpdatedAt: string | null = null;

  for (const updated of Object.values(prices)) {
    if (updated.updated && (!priceUpdatedAt || updated.updated > priceUpdatedAt)) priceUpdatedAt = updated.updated;
  }

  for (const recipe of data.recipes) {
    const output = data.items[recipe.out];
    if (!output || output.sell <= 0) continue;

    const reagents: ReagentCost[] = [];
    let reagentCost = 0;
    let missingPrice = false;

    for (const [id, count] of recipe.reagents) {
      const item = data.items[id];
      const price = prices[id];
      const ah = price ? (price.market > 0 ? price.market : price.historical > 0 ? price.historical : null) : null;
      const vendor = item?.vendor && item.buy > 0 ? item.buy : null;
      if (ah === null && vendor === null) {
        missingPrice = true;
        break;
      }
      const useVendor = ah === null;
      const unit = ah ?? vendor!;
      const line = unit * count;
      reagentCost += line;
      reagents.push({
        id,
        name: item?.name ?? `Item ${id}`,
        count,
        ah,
        vendor,
        unit,
        line,
        source: useVendor ? "vendor" : "ah",
        src: item?.src ?? "name-only",
      });
    }

    if (missingPrice) {
      excludedMissingPrice++;
      continue;
    }

    const vendorValue = output.sell * recipe.qty;
    const profit = vendorValue - reagentCost;
    const seconds = Math.max(recipe.castMs, recipe.cdMs, MIN_CRAFT_SECONDS * 1000) / 1000;

    rows.push({
      recipeId: recipe.id,
      name: recipe.name,
      prof: recipe.prof,
      skill: recipe.skill,
      outId: recipe.out,
      outName: output.name,
      outSrc: output.src,
      quality: output.quality,
      qty: recipe.qty,
      min: recipe.min,
      max: recipe.max,
      vendorValue,
      reagentCost,
      profit,
      seconds,
      profitPerHour: (profit / seconds) * 3600,
      castMs: recipe.castMs,
      cdMs: recipe.cdMs,
      cooldownBound: recipe.cdMs > recipe.castMs,
      reagents,
    });
  }

  rows.sort((a, b) => b.profitPerHour - a.profitPerHour);

  return {
    rows,
    totalRecipes: data.recipes.length,
    excludedMissingPrice,
    priceUpdatedAt,
  };
}
