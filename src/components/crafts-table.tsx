"use client";

import { Fragment, useMemo, useState } from "react";

import { formatCompactMoney, formatDuration, formatMoney } from "@/lib/money";
import type { FlipRow } from "@/lib/types";

type SortKey = "profitPerHour" | "profit" | "vendorValue" | "reagentCost" | "seconds";

const QUALITY = [
  "text-zinc-400",
  "text-zinc-100",
  "text-emerald-400",
  "text-sky-400",
  "text-fuchsia-400",
  "text-amber-400",
];

function profitColor(value: number) {
  return value >= 0 ? "text-emerald-400" : "text-rose-400";
}

function ClassicMark() {
  return (
    <span
      title="Vendor price from Classic Era client data: this item is missing from the Forever ItemSparse export"
      className="ml-1 cursor-help text-[10px] font-semibold text-amber-400/90"
    >
      ~
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  desc,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  desc: boolean;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 text-right font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 transition hover:text-zinc-100 ${active ? "text-cyan-300" : "text-zinc-400"}`}
      >
        {label}
        <span className="text-[10px]">{active ? (desc ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

export function CraftsTable({ rows, professions }: { rows: FlipRow[]; professions: string[] }) {
  const [profession, setProfession] = useState("all");
  const [query, setQuery] = useState("");
  const [hideUnprofitable, setHideUnprofitable] = useState(true);
  const [hideEstimated, setHideEstimated] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("profitPerHour");
  const [sortDesc, setSortDesc] = useState(true);
  const [limit, setLimit] = useState(100);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (profession !== "all" && row.prof !== profession) return false;
      if (hideUnprofitable && row.profit <= 0) return false;
      if (hideEstimated && (row.outSrc === "classic" || row.reagents.some((reagent) => reagent.src === "classic"))) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.outName.toLowerCase().includes(needle);
    });
    list.sort((a, b) => {
      const direction = sortDesc ? -1 : 1;
      return direction * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return list;
  }, [rows, profession, query, hideUnprofitable, hideEstimated, sortKey, sortDesc]);

  const visible = filtered.slice(0, limit);

  function changeSort(key: SortKey) {
    if (key === sortKey) setSortDesc((value) => !value);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 shadow-2xl shadow-black/40">
      <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipe or item…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none sm:max-w-xs"
          />
          <select
            value={profession}
            onChange={(event) => setProfession(event.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All professions</option>
            {professions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={hideUnprofitable}
              onChange={(event) => setHideUnprofitable(event.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900 accent-cyan-500"
            />
            Only profitable
          </label>
          <label
            className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-300"
            title="Hide recipes whose vendor or reagent prices rely on Classic Era data"
          >
            <input
              type="checkbox"
              checked={hideEstimated}
              onChange={(event) => setHideEstimated(event.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900 accent-amber-500"
            />
            Hide <span className="font-semibold text-amber-400/90">~</span> estimates
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-right font-medium text-zinc-500">#</th>
              <th className="px-3 py-2 font-medium text-zinc-400">Recipe</th>
              <th className="px-3 py-2 font-medium text-zinc-400">Output</th>
              <SortHeader label="Vendor" sortKey="vendorValue" active={sortKey === "vendorValue"} desc={sortDesc} onClick={changeSort} />
              <SortHeader label="Reagents" sortKey="reagentCost" active={sortKey === "reagentCost"} desc={sortDesc} onClick={changeSort} />
              <SortHeader label="Profit" sortKey="profit" active={sortKey === "profit"} desc={sortDesc} onClick={changeSort} />
              <SortHeader label="Time" sortKey="seconds" active={sortKey === "seconds"} desc={sortDesc} onClick={changeSort} />
              <SortHeader label="Profit / hour" sortKey="profitPerHour" active={sortKey === "profitPerHour"} desc={sortDesc} onClick={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {visible.map((row, index) => {
              const isOpen = expanded === row.recipeId;
              return (
                <Fragment key={row.recipeId}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : row.recipeId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpanded(isOpen ? null : row.recipeId);
                      }
                    }}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    className={`cursor-pointer transition hover:bg-zinc-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/40 ${isOpen ? "bg-zinc-900/60" : ""}`}
                  >
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{index + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-100">{row.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{row.prof}</span>
                        <span>skill {row.skill}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={QUALITY[row.quality] ?? QUALITY[1]}>{row.outName}</span>
                      {row.outSrc === "classic" && <ClassicMark />}
                      <span className="ml-1 text-xs text-zinc-500">
                        ×{row.qty % 1 === 0 ? row.qty : row.qty.toFixed(2)}
                        {row.min !== undefined ? ` (${row.min}–${row.max})` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{formatMoney(row.vendorValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatMoney(row.reagentCost)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${profitColor(row.profit)}`}>{formatMoney(row.profit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                      {formatDuration(row.seconds)}
                      {row.cooldownBound && <span className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-300">cd</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${profitColor(row.profitPerHour)}`}>
                      {formatCompactMoney(row.profitPerHour)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-zinc-900/40">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Reagent breakdown</h3>
                            <div className="overflow-hidden rounded-lg border border-zinc-800">
                              <table className="w-full text-xs">
                                <thead className="bg-zinc-900 text-zinc-500">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-medium">Item</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                                    <th className="px-2 py-1.5 text-right font-medium">AH</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Vendor</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Used</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/70">
                                  {row.reagents.map((reagent) => (
                                    <tr key={reagent.id}>
                                      <td className="px-2 py-1.5 text-zinc-200">
                                        {reagent.name}
                                        {reagent.src === "classic" && <ClassicMark />}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">{reagent.count}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{reagent.ah === null ? "—" : formatMoney(reagent.ah)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{reagent.vendor === null ? "—" : formatMoney(reagent.vendor)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums">
                                        <span className={reagent.source === "ah" ? "text-sky-300" : "text-amber-300"}>
                                          {reagent.source === "ah" ? "AH" : "Vendor"}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{formatMoney(reagent.line)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="space-y-3 text-xs text-zinc-400">
                            <div>
                              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Calculation</h3>
                              <p>
                                Vendor payout <span className="text-zinc-200">{formatMoney(row.vendorValue)}</span> − reagents{" "}
                                <span className="text-zinc-200">{formatMoney(row.reagentCost)}</span> ={" "}
                                <span className={profitColor(row.profit)}>{formatMoney(row.profit)}</span> per craft.
                              </p>
                              <p className="mt-1">
                                Time {formatDuration(row.seconds)}
                                {row.castMs > 0 && ` · cast ${formatDuration(row.castMs / 1000)}`}
                                {row.cdMs > 0 && ` · cooldown ${formatDuration(row.cdMs / 1000)}`}
                                {" · min 1.5s per craft"}
                              </p>
                              <p className="mt-1">
                                Profit per hour = <span className={profitColor(row.profitPerHour)}>{formatMoney(row.profitPerHour)}</span>
                              </p>
                            </div>
                            <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 text-[11px] leading-relaxed text-zinc-500">
                              Reagent unit cost is the EU market value (or historical value). The vendor price is used only when the item has no auction data and an NPC actually sells it. Cooldown-bound crafts assume one craft per cooldown.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {!visible.length && (
        <p className="p-8 text-center text-sm text-zinc-500">No recipes match these filters.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">
        <span>
          Showing {visible.length.toLocaleString("en-US")} of {filtered.length.toLocaleString("en-US")} recipes
        </span>
        {limit < filtered.length && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLimit((value) => value + 100)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 font-medium text-zinc-300 transition hover:border-cyan-500 hover:text-cyan-300"
            >
              Show 100 more
            </button>
            <button
              type="button"
              onClick={() => setLimit(filtered.length)}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              Show all
            </button>
          </div>
        )}
      </div>

      {rows.some((row) => row.outSrc === "classic" || row.reagents.some((reagent) => reagent.src === "classic")) && (
        <p className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
          <span className="font-semibold text-amber-400/90">~</span> Vendor price from Classic Era client data — the item is missing from the Forever ItemSparse export.
        </p>
      )}
    </section>
  );
}
