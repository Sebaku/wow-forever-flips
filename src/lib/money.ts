const GOLD = 10000;
const SILVER = 100;

export function formatMoney(copper: number): string {
  const value = Math.round(copper);
  const sign = value < 0 ? "-" : "";
  let rest = Math.abs(value);
  const gold = Math.floor(rest / GOLD);
  rest -= gold * GOLD;
  const silver = Math.floor(rest / SILVER);
  const cop = rest - silver * SILVER;

  const parts: string[] = [];
  if (gold) parts.push(`${gold.toLocaleString("en-US")}g`);
  if (silver) parts.push(`${silver}s`);
  if (cop || !parts.length) parts.push(`${cop}c`);
  return sign + parts.join(" ");
}

export function formatCompactMoney(copper: number): string {
  const abs = Math.abs(copper);
  const sign = copper < 0 ? "-" : "";
  if (abs >= 100 * GOLD) return `${sign}${Math.round(abs / GOLD).toLocaleString("en-US")}g`;
  if (abs >= GOLD) return `${sign}${(abs / GOLD).toFixed(1)}g`;
  return formatMoney(copper);
}

export function formatQty(value: number): string {
  if (Math.abs(value - Math.round(value)) < 0.005) return String(Math.round(value));
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
