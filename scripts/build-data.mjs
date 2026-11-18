import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'crafts.json');
const UA = 'wow-forever-flips/0.1 (personal crafting profit calculator)';
const FDB_API_KEY = (process.env.FDB_API_KEY ?? '').trim();
const FDB_API_URL = 'https://foreverdb.net/api/v1';
const FDB_API_TTL_MS = 7 * 24 * 3600 * 1000;
const FDB_API_REFRESH = process.env.FDB_REFRESH === '1';

const PROFESSION_ORDER = [
  'Alchemy',
  'Blacksmithing',
  'Enchanting',
  'Engineering',
  'Leatherworking',
  'Tailoring',
  'Cooking',
  'First Aid',
  'Mining',
];

function mkdirFor(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

async function httpText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/csv,text/plain,application/json,*/*' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchTo(file, url, sha256, bytes) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file, 'utf8');
  mkdirFor(file);
  const text = await httpText(url);
  if (bytes && Buffer.byteLength(text) !== bytes) throw new Error(`${url}: expected ${bytes} bytes, got ${Buffer.byteLength(text)}`);
  if (sha256) {
    const got = crypto.createHash('sha256').update(text).digest('hex');
    if (got !== sha256) throw new Error(`${url}: sha256 mismatch`);
  }
  fs.writeFileSync(file, text);
  return text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function copperOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    const gold = Number(value.gold);
    const silver = Number(value.silver);
    const copper = Number(value.copper);
    if ([gold, silver, copper].some(Number.isFinite) && (value.gold !== undefined || value.silver !== undefined || value.copper !== undefined)) {
      return (Number.isFinite(gold) ? gold : 0) * 10000 + (Number.isFinite(silver) ? silver : 0) * 100 + (Number.isFinite(copper) ? copper : 0);
    }
    for (const key of ['amount', 'copperValue', 'copper', 'value', 'sellPrice']) {
      const n = Number(value[key]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function apiItemInfo(payload) {
  const root = payload?.data ?? payload;
  const layers = [
    root,
    root?.item,
    root?.dataFromBuild,
    root?.dataFromBuild?.values,
    root?.liveClient?.live,
    root?.liveClient?.live?.values,
    root?.liveClient,
  ];
  const info = { name: null, sell: null, buy: null, quality: null };
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    if (info.name === null && typeof layer.name === 'string' && layer.name) info.name = layer.name;
    if (info.quality === null) {
      const q = Number(layer.quality ?? layer.overallQualityId ?? layer.qualityId);
      if (Number.isFinite(q) && q >= 0) info.quality = q;
    }
    if (info.sell === null) {
      info.sell = copperOf(layer.sellPrice ?? layer.vendorSellPrice ?? layer.sellValue ?? layer.sellPriceCopper ?? layer.sellprice ?? layer.sell);
    }
    if (info.buy === null) {
      info.buy = copperOf(layer.buyPrice ?? layer.vendorBuyPrice ?? layer.buyPriceCopper ?? layer.buyprice ?? layer.buy);
    }
  }
  return info;
}

let fdbLastCall = 0;

async function fdbGet(pathname) {
  const wait = Math.max(0, fdbLastCall + 2100 - Date.now());
  if (wait) await sleep(wait);
  fdbLastCall = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(`${FDB_API_URL}${pathname}`, {
        headers: { 'x-api-key': FDB_API_KEY, 'user-agent': UA, accept: 'application/json' },
      });
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retry) && retry > 0 ? retry : 10) * 1000);
      continue;
    }
    if (res.status === 402) {
      const err = new Error('quota exceeded (HTTP 402 subscription_required)');
      err.code = 'QUOTA';
      throw err;
    }
    if (res.status === 401 || res.status === 403) {
      const err = new Error(`key rejected (HTTP ${res.status})`);
      err.code = 'AUTH';
      throw err;
    }
    if (!res.ok) {
      if (attempt === 3) throw new Error(`HTTP ${res.status}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    return res.json();
  }
  throw new Error('retries exhausted');
}

const apiCacheDir = path.join(ROOT, '.cache', 'fdb-api', 'items');
const apiStats = { targets: 0, cached: 0, fetched: 0, priced: 0, zero: 0, failed: 0 };

async function fetchApiItem(id) {
  const file = path.join(apiCacheDir, `${id}.json`);
  if (!FDB_API_REFRESH && fs.existsSync(file)) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Date.now() - cached.fetchedAt < FDB_API_TTL_MS) {
        apiStats.cached++;
        return cached.data;
      }
    } catch {
      // ignore broken cache entry and refetch
    }
  }
  const payload = await fdbGet(`/items/${id}`);
  const data = apiItemInfo(payload);
  const record = { fetchedAt: Date.now(), build: payload?.meta?.build ?? null, data };
  mkdirFor(file);
  fs.writeFileSync(file, JSON.stringify(record));
  apiStats.fetched++;
  return data;
}

function parseCsv(text) {  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift().map((h) => h.replace(/^\uFEFF/, ''));
  return { header, rows };
}

function csvObjects(text) {
  const { header, rows } = parseCsv(text);
  return rows.map((r) => {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = r[i] ?? '';
    return o;
  });
}

function extractBalanced(src, openIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error('unbalanced Lua table');
}

function parseLuaLiteral(src) {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  function value() {
    ws();
    const c = src[i];
    if (c === '{') return table();
    if (c === '"') return str();
    if (c === '-' || (c >= '0' && c <= '9')) return num();
    if (src.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (src.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (src.startsWith('nil', i)) {
      i += 3;
      return null;
    }
    throw new Error(`unexpected Lua token at ${i}: ${JSON.stringify(src.slice(i, i + 40))}`);
  }
  function str() {
    i++;
    let out = '';
    while (i < src.length) {
      const c = src[i++];
      if (c === '"') return out;
      if (c === '\\') {
        const e = src[i++];
        if (e === 'n') out += '\n';
        else if (e === 't') out += '\t';
        else if (e === 'r') out += '\r';
        else if (e === 'x') {
          out += String.fromCharCode(parseInt(src.slice(i, i + 2), 16));
          i += 2;
        } else out += e;
      } else out += c;
    }
    throw new Error('unterminated Lua string');
  }
  function num() {
    const start = i;
    if (src[i] === '-') i++;
    while (i < src.length && /[0-9.eE+\-]/.test(src[i])) i++;
    return Number(src.slice(start, i));
  }
  function table() {
    i++;
    const arr = [];
    const obj = {};
    let hasKeys = false;
    for (;;) {
      ws();
      if (src[i] === '}') {
        i++;
        break;
      }
      if (src[i] === ',') {
        i++;
        continue;
      }
      const save = i;
      const c = src[i];
      if (c === '[') {
        i++;
        const k = value();
        ws();
        if (src[i] !== ']') throw new Error(`expected ] at ${i}`);
        i++;
        ws();
        if (src[i] !== '=') throw new Error(`expected = at ${i}`);
        i++;
        obj[String(k)] = value();
        hasKeys = true;
      } else if (/[A-Za-z_]/.test(c)) {
        const id = /[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        if (src[i + id.length] === '=') {
          i += id.length + 1;
          obj[id] = value();
          hasKeys = true;
        } else {
          i = save;
          arr.push(value());
        }
      } else arr.push(value());
    }
    if (hasKeys && arr.length) for (let k = 0; k < arr.length; k++) obj[String(k + 1)] = arr[k];
    return hasKeys ? obj : arr;
  }
  const v = value();
  ws();
  if (i !== src.length) throw new Error(`trailing Lua data at ${i}: ${JSON.stringify(src.slice(i, i + 40))}`);
  return v;
}

function luaAssignment(src, name) {
  const at = src.indexOf(`${name} = `);
  if (at < 0) throw new Error(`missing ${name}`);
  const start = src.indexOf('{', at);
  return parseLuaLiteral(extractBalanced(src, start));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function versionKey(v) {
  return v
    .split('.')
    .map(Number)
    .reduce((acc, part) => acc * 100000 + part, 0);
}

async function latestBuild(product, cacheFile) {
  if (product === 'wowf' && process.env.WOWF_BUILD) return process.env.WOWF_BUILD;
  if (product === 'wow_classic_era' && process.env.CLASSIC_ERA_BUILD) return process.env.CLASSIC_ERA_BUILD;
  const fresh = fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < 6 * 3600 * 1000;
  const text = fresh ? fs.readFileSync(cacheFile, 'utf8') : await httpText('https://wago.tools/api/builds');
  if (!fresh) {
    mkdirFor(cacheFile);
    fs.writeFileSync(cacheFile, text);
  }
  const builds = JSON.parse(text)[product];
  if (!Array.isArray(builds) || !builds.length) throw new Error(`no builds for ${product}`);
  return builds.map((b) => b.version).sort((a, b) => versionKey(b) - versionKey(a))[0];
}

async function downloadTable(product, build, table) {
  const file = path.join(ROOT, '.cache', 'db2', product, build, `${table}.csv`);
  return fetchTo(file, `https://wago.tools/db2/${table}/csv?build=${build}&locale=enUS`);
}

function loadItemSparse(text) {
  const map = new Map();
  for (const r of csvObjects(text)) {
    const id = num(r.ID);
    if (!id) continue;
    map.set(id, {
      name: r.Display_lang ?? '',
      sell: num(r.SellPrice),
      buy: num(r.BuyPrice),
      quality: num(r.OverallQualityID),
      bonding: num(r.Bonding),
    });
  }
  return map;
}

function parseReagents(value) {
  const list = [];
  for (const part of String(value ?? '').split(',')) {
    if (!part) continue;
    const [id, count] = part.split(':').map(Number);
    if (id && count > 0) list.push([id, count]);
  }
  return list;
}

console.log('Fetching ForeverDB data manifest...');
const manifest = JSON.parse(await httpText('https://foreverdb.net/downloads/addon-manifest.json'));
const dataVersion = manifest.data.version;
const dataDir = path.join(ROOT, '.cache', 'fdb', dataVersion);
const dataFile = (name) => {
  const entry = manifest.data.files.find((f) => f.path === `Data/${name}`);
  if (!entry) throw new Error(`ForeverDB manifest is missing Data/${name}`);
  return { file: path.join(dataDir, name), url: new URL(entry.url, 'https://foreverdb.net/').toString(), meta: entry };
};

const metaEntry = dataFile('Meta.lua');
const meta = luaAssignment(await fetchTo(metaEntry.file, metaEntry.url, metaEntry.meta.sha256, metaEntry.meta.bytes), 'ns.meta');
const recipesEntry = dataFile('Recipes.lua');
const recipesLua = await fetchTo(recipesEntry.file, recipesEntry.url, recipesEntry.meta.sha256, recipesEntry.meta.bytes);
const itemsEntry = dataFile('Items.lua');
const itemsLua = luaAssignment(await fetchTo(itemsEntry.file, itemsEntry.url, itemsEntry.meta.sha256, itemsEntry.meta.bytes), 'ns.items');
console.log(`ForeverDB data ${meta.version} (build ${meta.build})`);

const rawRecipes = luaAssignment(recipesLua, 'ns.recipes');
const names = luaAssignment(recipesLua, 'ns.names');

function soldByVendor(id) {
  const facts = itemsLua[id];
  if (typeof facts !== 'string') return false;
  for (const part of facts.split('|')) {
    const match = /^v(\d+)~/.exec(part);
    if (match && Number(match[1]) > 0) return true;
  }
  return false;
}

const foreverBuild = await latestBuild('wowf', path.join(ROOT, '.cache', 'wago-builds.json'));
const classicBuild = await latestBuild('wow_classic_era', path.join(ROOT, '.cache', 'wago-builds.json'));
console.log(`WoW Forever build: ${foreverBuild}`);
console.log(`Classic Era build: ${classicBuild}`);

console.log('Loading item and spell tables...');
const foreverItems = loadItemSparse(await downloadTable('wowf', foreverBuild, 'ItemSparse'));
const classicItems = loadItemSparse(await downloadTable('wow_classic_era', classicBuild, 'ItemSparse'));
console.log(`  ItemSparse forever: ${foreverItems.size} rows`);
console.log(`  ItemSparse classic era: ${classicItems.size} rows`);

const spellMisc = new Map();
for (const r of csvObjects(await downloadTable('wowf', foreverBuild, 'SpellMisc'))) {
  const spellId = num(r.SpellID);
  if (spellId && !spellMisc.has(spellId)) spellMisc.set(spellId, r);
}
const castTimes = new Map();
for (const r of csvObjects(await downloadTable('wowf', foreverBuild, 'SpellCastTimes'))) castTimes.set(num(r.ID), num(r.Base));
const cooldowns = new Map();
for (const r of csvObjects(await downloadTable('wowf', foreverBuild, 'SpellCooldowns'))) {
  const spellId = num(r.SpellID);
  if (!spellId) continue;
  const value = Math.max(num(r.RecoveryTime), num(r.CategoryRecoveryTime));
  cooldowns.set(spellId, Math.max(cooldowns.get(spellId) ?? 0, value));
}
console.log(`  SpellMisc: ${spellMisc.size}, SpellCastTimes: ${castTimes.size}, cooldowns: ${cooldowns.size}`);

const apiItems = new Map();

function lookupItem(id) {
  const api = apiItems.get(id);
  const forever = foreverItems.get(id);
  const classic = classicItems.get(id);
  const base = forever ?? classic;
  if (api) {
    return {
      name: api.name || base?.name || '',
      sell: api.sell,
      buy: api.buy ?? 0,
      quality: api.quality ?? base?.quality ?? 0,
      bonding: base?.bonding ?? 0,
      src: 'api',
      vendor: soldByVendor(id),
    };
  }
  if (forever) return { ...forever, src: 'forever', vendor: soldByVendor(id) };
  if (classic) return { ...classic, src: 'classic', vendor: soldByVendor(id) };
  return null;
}

function apiTargets() {
  const ids = new Set();
  for (const profession of PROFESSION_ORDER) {
    const list = rawRecipes[profession];
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const outId = num(row[6]);
      if (outId) {
        const output = lookupItem(outId);
        if (!output || output.src === 'classic') ids.add(outId);
      }
      for (const [reagentId] of parseReagents(row[8])) {
        const reagent = lookupItem(reagentId);
        if (!reagent || reagent.src === 'classic') ids.add(reagentId);
      }
    }
  }
  return [...ids];
}

if (FDB_API_KEY) {
  const targets = apiTargets();
  apiStats.targets = targets.length;
  console.log(`ForeverDB API: resolving ${targets.length} hidden or Classic-fallback items...`);
  let stop = false;
  for (let i = 0; i < targets.length && !stop; i++) {
    const id = targets[i];
    try {
      const info = await fetchApiItem(id);
      if (info && info.sell !== null) {
        apiItems.set(id, info);
        if (info.sell > 0) apiStats.priced++;
        else apiStats.zero++;
      }
    } catch (err) {
      apiStats.failed++;
      if (err.code === 'QUOTA' || err.code === 'AUTH') {
        console.warn(`  ${err.message}; stopping API resolution for this run`);
        stop = true;
      } else {
        console.warn(`  item ${id}: ${err.message}`);
      }
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${targets.length}`);
  }
  console.log(
    `  API items used: ${apiItems.size} (${apiStats.priced} priced, ${apiStats.zero} vendor value 0, ` +
      `${apiStats.cached} cached, ${apiStats.fetched} fetched, ${apiStats.failed} failed)`,
  );
} else {
  console.log('ForeverDB API: disabled (set FDB_API_KEY in .env.local to resolve hidden items)');
}

const stats = {
  candidates: 0,
  duplicate: 0,
  noOutput: 0,
  missingOutputItem: 0,
  noVendorValue: 0,
  emptyReagents: 0,
  missingReagentItem: 0,
  boundReagent: 0,
  boundReagentRecipes: 0,
  graphRecipes: 0,
  kept: 0,
  classicFallbackOutputs: 0,
  classicFallbackReagents: 0,
  noSpellData: 0,
  instantRecipes: 0,
  randomCountRecipes: 0,
};

const missingOutputIds = new Set();
const missingReagentIds = new Set();
const noVendorIds = new Set();
const boundIds = new Set();
const usedItemIds = new Set();
const seenSpells = new Set();
const recipes = [];
const perProfession = {};

for (const profession of PROFESSION_ORDER) {
  const list = rawRecipes[profession];
  if (!Array.isArray(list)) continue;
  perProfession[profession] = 0;
  for (const row of list) {
    stats.candidates++;
    const spellId = num(row[0]);
    const name = String(row[1] ?? '').trim();
    const skill = num(row[2]);
    const outId = num(row[6]);
    const rawQty = num(row[7]);
    const reagents = parseReagents(row[8]);
    const minQty = row.length >= 15 ? num(row[13]) : rawQty;
    const maxQty = row.length >= 15 ? num(row[14]) : rawQty;

    if (seenSpells.has(spellId)) {
      stats.duplicate++;
      continue;
    }
    seenSpells.add(spellId);

    if (!outId) {
      stats.noOutput++;
      continue;
    }
    if (!reagents.length) {
      stats.emptyReagents++;
      continue;
    }

    const qty = rawQty > 0 ? rawQty : (minQty + maxQty) / 2;
    if (!(qty > 0)) {
      stats.noOutput++;
      continue;
    }
    if (maxQty > minQty) stats.randomCountRecipes++;

    const item = lookupItem(outId);
    if (!item) {
      stats.missingOutputItem++;
      missingOutputIds.add(outId);
    } else {
      if (item.src === 'classic') stats.classicFallbackOutputs++;
      if (item.sell <= 0) {
        stats.noVendorValue++;
        noVendorIds.add(outId);
      } else {
        stats.kept++;
      }
    }

    let recipeBound = false;
    for (const [reagentId] of reagents) {
      const reagent = lookupItem(reagentId);
      if (!reagent) {
        stats.missingReagentItem++;
        missingReagentIds.add(reagentId);
        continue;
      }
      if (reagent.src === 'classic') stats.classicFallbackReagents++;
      if (reagent.bonding === 1 && !reagent.vendor) {
        stats.boundReagent++;
        boundIds.add(reagentId);
        recipeBound = true;
      }
    }
    if (recipeBound) stats.boundReagentRecipes++;

    const misc = spellMisc.get(spellId);
    const castMs = misc ? Math.max(0, castTimes.get(num(misc.CastingTimeIndex)) ?? 0) : 0;
    const cooldownMs = cooldowns.get(spellId) ?? 0;
    if (!misc) stats.noSpellData++;
    if (castMs <= 0 && cooldownMs <= 0) stats.instantRecipes++;

    recipes.push({
      id: spellId,
      name,
      prof: profession,
      skill,
      out: outId,
      qty,
      min: maxQty > minQty ? minQty : undefined,
      max: maxQty > minQty ? maxQty : undefined,
      castMs,
      cdMs: cooldownMs,
      reagents,
    });

    usedItemIds.add(outId);
    for (const [reagentId] of reagents) usedItemIds.add(reagentId);
    perProfession[profession]++;
  }
}

stats.graphRecipes = recipes.length;

const items = {};
for (const id of usedItemIds) {
  const item = lookupItem(id);
  items[id] = {
    name: item?.name || names[id] || `Item ${id}`,
    sell: item?.sell ?? 0,
    buy: item?.buy ?? 0,
    quality: item?.quality ?? 0,
    src: item?.src ?? 'name-only',
    vendor: item?.vendor ?? false,
    bound: item?.bonding === 1,
  };
}

recipes.sort((a, b) => a.prof.localeCompare(b.prof) || a.skill - b.skill || a.name.localeCompare(b.name));

const professions = PROFESSION_ORDER.filter((p) => perProfession[p] > 0).map((p) => ({ name: p, recipes: perProfession[p] }));

const payload = {
  sources: {
    foreverBuild,
    classicEraBuild: classicBuild,
    foreverdb: { version: meta.version, build: meta.build, site: meta.site },
    itemFallback: 'Classic Era ItemSparse for items absent from Forever ItemSparse',
    apiKeyUsed: Boolean(FDB_API_KEY),
    apiItems: apiItems.size,
  },
  generatedAt: new Date().toISOString(),
  professions,
  items,
  recipes,
  stats: {
    ...stats,
    recipesByProfession: perProfession,
    missingOutputItems: missingOutputIds.size,
    missingReagentItems: missingReagentIds.size,
    itemsWithoutVendorValue: noVendorIds.size,
    boundReagentItems: boundIds.size,
    intermediateRecipes: stats.graphRecipes - stats.kept,
  },
};

mkdirFor(OUT_FILE);
fs.writeFileSync(OUT_FILE, JSON.stringify(payload));

console.log('\nStats:', payload.stats);
console.log(`Recipes in graph: ${recipes.length} (${stats.kept} sellable), unique items: ${Object.keys(items).length}`);
for (const p of professions) console.log(`  ${p.name}: ${p.recipes}`);
console.log(`Wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(0)} KB)`);

if (missingOutputIds.size) {
  const named = [...missingOutputIds].slice(0, 25).map((id) => `${id}${names[id] ? ` ${names[id]}` : ''}`);
  console.log('Recipe outputs missing from item price data:', named.join(' | '));
}
