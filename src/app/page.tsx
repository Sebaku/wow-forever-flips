import type { Metadata } from "next";

import { CraftsTable } from "@/components/crafts-table";
import { analyze } from "@/lib/analysis";
import { crafts } from "@/lib/crafts";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { getPrices } from "@/lib/prices";

export const metadata: Metadata = {
  title: "Forever Flips — WoW Forever vendor crafting",
  description:
    "Every craftable recipe in World of Warcraft: Forever (EU), ranked by vendor profit per hour using live auction house prices.",
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-zinc-500" title={hint}>{hint}</p>}
    </div>
  );
}

export default async function Home() {
  const prices = await getPrices();
  const analysis = analyze(crafts, prices);

  const profitable = analysis.rows.filter((row) => row.profit > 0);
  const best = profitable[0];
  const missingOutput = Number(crafts.stats.missingOutputItems ?? 0);
  const updated = analysis.priceUpdatedAt ? new Date(analysis.priceUpdatedAt) : null;
  const updatedLabel = updated
    ? `${updated.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`
    : "unknown";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">World of Warcraft: Forever · EU</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Vendor flip calculator</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Buy reagents from the auction house, craft, and sell the result to a vendor. Every recipe is ranked by{" "}
            <span className="text-zinc-200">profit per hour</span> of crafting time, so fast recipes with small margins can beat slow ones with big margins.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-500">
          <p>
            Forever build <span className="text-zinc-300">{crafts.sources.foreverdb.build}</span>
          </p>
          <p className="mt-1">
            Auction prices from <span className="text-zinc-300">TSM EU</span> · updated{" "}
            <span className="text-zinc-300">{updatedLabel}</span>
          </p>
          <p className="mt-1">
            Item data built <span className="text-zinc-300">{new Date(crafts.generatedAt).toISOString().slice(0, 10)}</span>
          </p>
          {crafts.sources.apiItems > 0 && (
            <p className="mt-1">
              Hidden items via <span className="text-zinc-300">ForeverDB API</span>: {crafts.sources.apiItems.toLocaleString("en-US")}
            </p>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Best profit / hour"
          value={best ? formatCompactMoney(best.profitPerHour) : "—"}
          hint={best ? `${best.name} · ${formatMoney(best.profit)} per craft` : "No profitable recipes found"}
        />
        <StatCard
          label="Profitable recipes"
          value={profitable.length.toLocaleString("en-US")}
          hint={`of ${analysis.rows.length.toLocaleString("en-US")} recipes with complete prices`}
        />
        <StatCard
          label="Recipes priced"
          value={analysis.rows.length.toLocaleString("en-US")}
          hint={`${analysis.excludedMissingPrice.toLocaleString("en-US")} skipped: reagent has no AH or vendor price`}
        />
        <StatCard
          label="Crafting time floor"
          value="1.5s per craft"
          hint="Cast time, cooldown, or GCD — whichever is longest"
        />
      </div>

      {(missingOutput > 0 || analysis.excludedMissingPrice > 0) && (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
          {missingOutput > 0 && `${missingOutput} recipes are excluded because their output item is missing from both the Forever and Classic Era item price data. `}
          {analysis.excludedMissingPrice > 0 &&
            `${analysis.excludedMissingPrice} recipes are excluded because a reagent has neither an auction price nor a vendor price.`}
        </p>
      )}

      <div className="mt-6">
        <CraftsTable rows={analysis.rows} professions={crafts.professions.map((profession) => profession.name)} />
      </div>

      <footer className="mt-8 flex flex-col gap-2 border-t border-zinc-800 pt-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Data from{" "}
          <a className="text-zinc-300 underline decoration-zinc-700 underline-offset-2 hover:text-cyan-300" href="https://foreverdb.net">
            ForeverDB.net
          </a>{" "}
          (GPL-3.0 §7(b)) · auction prices from TradeSkillMaster public data · client tables from wago.tools.
        </p>
        <p>
          Vendor prices are fixed per game build. Not affiliated with Blizzard Entertainment.
        </p>
      </footer>
    </main>
  );
}
