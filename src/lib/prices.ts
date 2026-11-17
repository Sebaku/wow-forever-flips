import { cacheLife } from "next/cache";

import { parseCsv } from "./csv";
import type { Prices } from "./types";

const URL = "https://public-data.tradeskillmaster.com/forever/eu/region/items.csv";

export async function getPrices(): Promise<Prices> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });

  const res = await fetch(URL, {
    headers: {
      accept: "text/csv",
      "user-agent": "wow-forever-flips/0.1 (personal crafting profit calculator)",
    },
  });
  if (!res.ok) throw new Error(`TSM price download failed: HTTP ${res.status}`);

  const rows = parseCsv(await res.text());
  const header = rows.shift() ?? [];
  const column = (name: string) => header.indexOf(name);
  const idAt = column("itemId");
  const marketAt = column("marketValue");
  const historicalAt = column("historical");
  const updatedAt = column("updatedAt");
  if (idAt < 0 || marketAt < 0 || historicalAt < 0) throw new Error("Unexpected TSM price CSV header");

  const prices: Prices = {};
  for (const row of rows) {
    const id = Number(row[idAt]);
    if (!id) continue;
    const market = Number(row[marketAt]) || 0;
    const historical = Number(row[historicalAt]) || 0;
    if (market <= 0 && historical <= 0) continue;
    prices[id] = {
      market,
      historical,
      updated: updatedAt >= 0 ? (row[updatedAt] ?? "") : "",
    };
  }
  return prices;
}
