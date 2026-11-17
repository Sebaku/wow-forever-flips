export type ItemSource = "forever" | "classic" | "api" | "name-only";

export type CraftsItem = {
  name: string;
  sell: number;
  buy: number;
  quality: number;
  src: ItemSource;
  vendor: boolean;
};

export type CraftsRecipe = {
  id: number;
  name: string;
  prof: string;
  skill: number;
  out: number;
  qty: number;
  min?: number;
  max?: number;
  castMs: number;
  cdMs: number;
  reagents: [number, number][];
};

export type CraftsData = {
  sources: {
    foreverBuild: string;
    classicEraBuild: string;
    foreverdb: { version: string; build: string; site: string };
    itemFallback: string;
    apiKeyUsed: boolean;
    apiItems: number;
  };
  generatedAt: string;
  professions: { name: string; recipes: number }[];
  items: Record<string, CraftsItem>;
  recipes: CraftsRecipe[];
  stats: Record<string, number | Record<string, number>>;
};

export type PriceRow = {
  market: number;
  historical: number;
  updated: string;
};

export type Prices = Record<string, PriceRow>;

export type ReagentCost = {
  id: number;
  name: string;
  count: number;
  ah: number | null;
  vendor: number | null;
  unit: number;
  line: number;
  source: "ah" | "vendor";
  src: ItemSource;
};

export type FlipRow = {
  recipeId: number;
  name: string;
  prof: string;
  skill: number;
  outId: number;
  outName: string;
  outSrc: ItemSource;
  quality: number;
  qty: number;
  min?: number;
  max?: number;
  vendorValue: number;
  reagentCost: number;
  profit: number;
  seconds: number;
  profitPerHour: number;
  castMs: number;
  cdMs: number;
  cooldownBound: boolean;
  reagents: ReagentCost[];
};

export type Analysis = {
  rows: FlipRow[];
  totalRecipes: number;
  excludedMissingPrice: number;
  priceUpdatedAt: string | null;
};
