import type {
  Analysis,
  AnalyzeMode,
  CraftsData,
  CraftsRecipe,
  FlipRow,
  Prices,
  ReagentCost,
} from "./types";

const MIN_CRAFT_SECONDS = 1.5;

type ResolvedLine = {
  id: number;
  count: number;
  resolved: Resolved;
};

type Resolved = {
  unitCost: number;
  unitTime: number;
  source: "ah" | "vendor" | "craft";
  ah: number | null;
  vendor: number | null;
  recipe?: CraftsRecipe;
  children: ResolvedLine[];
};

function craftSeconds(recipe: CraftsRecipe): number {
  return Math.max(recipe.castMs, recipe.cdMs, MIN_CRAFT_SECONDS * 1000) / 1000;
}

function isBetter(a: FlipRow, b: FlipRow): boolean {
  if (a.profitPerHour !== b.profitPerHour) return a.profitPerHour > b.profitPerHour;
  if (a.profit !== b.profit) return a.profit > b.profit;
  return a.seconds < b.seconds;
}

export function combineBest(data: CraftsData, buy: Analysis, craft: Analysis): Analysis {
  const chosen = new Map<number, FlipRow>();
  for (const row of buy.rows) chosen.set(row.recipeId, row);
  for (const row of craft.rows) {
    const current = chosen.get(row.recipeId);
    if (!current || isBetter(row, current)) chosen.set(row.recipeId, row);
  }

  const rows = [...chosen.values()].sort((a, b) => b.profitPerHour - a.profitPerHour);
  const present = new Set(rows.map((row) => row.recipeId));
  const excludedMissingPrice = data.recipes.filter((recipe) => {
    const output = data.items[recipe.out];
    return output && output.sell > 0 && !present.has(recipe.id);
  }).length;

  return {
    rows,
    mode: "best",
    totalRecipes: data.recipes.length,
    excludedMissingPrice,
    priceUpdatedAt: buy.priceUpdatedAt ?? craft.priceUpdatedAt,
  };
}

export function analyze(data: CraftsData, prices: Prices, mode: AnalyzeMode = "buy"): Analysis {
  if (mode === "best") {
    const buy = analyze(data, prices, "buy");
    const craft = analyze(data, prices, "craft");
    return combineBest(data, buy, craft);
  }

  const rows: FlipRow[] = [];
  let excludedMissingPrice = 0;
  let priceUpdatedAt: string | null = null;

  for (const updated of Object.values(prices)) {
    if (updated.updated && (!priceUpdatedAt || updated.updated > priceUpdatedAt)) priceUpdatedAt = updated.updated;
  }

  const byOutput = new Map<number, CraftsRecipe[]>();
  for (const recipe of data.recipes) {
    const list = byOutput.get(recipe.out);
    if (list) list.push(recipe);
    else byOutput.set(recipe.out, [recipe]);
  }

  const memo = new Map<number, Resolved | null>();
  const stack = new Set<number>();

  function resolve(id: number): Resolved | null {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    const item = data.items[id];
    const price = prices[id];
    const bound = item?.bound ?? false;
    const ah = bound ? null : price ? (price.market > 0 ? price.market : price.historical > 0 ? price.historical : null) : null;
    const vendor = item?.vendor && item.buy > 0 ? item.buy : null;

    const buy = (): Resolved | null =>
      ah === null && vendor === null
        ? null
        : {
            unitCost: ah ?? vendor!,
            unitTime: 0,
            source: ah !== null ? "ah" : "vendor",
            ah,
            vendor,
            children: [],
          };

    if (mode === "buy" || stack.has(id)) {
      const result = buy();
      if (!stack.has(id)) memo.set(id, result);
      return result;
    }

    const bought = buy();
    let best: Resolved | null = null;
    stack.add(id);
    for (const recipe of byOutput.get(id) ?? []) {
      if (!(recipe.qty > 0)) continue;
      let cost = 0;
      let time = craftSeconds(recipe);
      const children: ResolvedLine[] = [];
      let ok = true;
      for (const [reagentId, count] of recipe.reagents) {
        const child = resolve(reagentId);
        if (!child) {
          ok = false;
          break;
        }
        cost += child.unitCost * count;
        time += child.unitTime * count;
        children.push({ id: reagentId, count, resolved: child });
      }
      if (!ok) continue;
      const unitCost = cost / recipe.qty;
      const unitTime = time / recipe.qty;
      if (!best || unitCost < best.unitCost || (unitCost === best.unitCost && unitTime < best.unitTime)) {
        best = { unitCost, unitTime, source: "craft", ah, vendor, recipe, children };
      }
    }
    stack.delete(id);

    const result =
      best && (!bought || best.unitCost < bought.unitCost || (best.unitCost === bought.unitCost && best.unitTime < bought.unitTime))
        ? best
        : bought ?? best;
    memo.set(id, result);
    return result;
  }

  function buildNode(id: number, count: number, resolved: Resolved): ReagentCost {
    const item = data.items[id];
    const recipe = resolved.recipe;
    const crafts = recipe && resolved.source === "craft" ? count / recipe.qty : 0;
    return {
      id,
      name: item?.name ?? `Item ${id}`,
      count,
      ah: resolved.ah,
      vendor: resolved.vendor,
      unit: resolved.unitCost,
      line: resolved.unitCost * count,
      time: resolved.unitTime * count,
      source: resolved.source,
      src: item?.src ?? "name-only",
      recipe: recipe
        ? {
            id: recipe.id,
            name: recipe.name,
            qty: recipe.qty,
            castMs: recipe.castMs,
            cdMs: recipe.cdMs,
            min: recipe.min,
            max: recipe.max,
          }
        : undefined,
      children: recipe
        ? resolved.children.map((child) => buildNode(child.id, child.count * crafts, child.resolved))
        : [],
    };
  }

  for (const recipe of data.recipes) {
    const output = data.items[recipe.out];
    if (!output || output.sell <= 0) continue;

    const reagents: ReagentCost[] = [];
    let reagentCost = 0;
    let reagentTime = 0;
    let crafted = false;
    let missingPrice = false;

    for (const [id, count] of recipe.reagents) {
      const item = data.items[id];
      const resolved = resolve(id);
      if (!resolved) {
        missingPrice = true;
        break;
      }
      if (item?.bound && resolved.source === "ah") {
        missingPrice = true;
        break;
      }
      const node = buildNode(id, count, resolved);
      reagentCost += node.line;
      reagentTime += node.time;
      reagents.push(node);
      if (resolved.source === "craft") crafted = true;
    }

    if (missingPrice) {
      excludedMissingPrice++;
      continue;
    }

    const vendorValue = output.sell * recipe.qty;
    const profit = vendorValue - reagentCost;
    const seconds = craftSeconds(recipe) + reagentTime;

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
      crafted,
      path: crafted ? "craft" : "buy",
      reagents,
    });
  }

  rows.sort((a, b) => b.profitPerHour - a.profitPerHour);

  return {
    rows,
    mode,
    totalRecipes: data.recipes.length,
    excludedMissingPrice,
    priceUpdatedAt,
  };
}
