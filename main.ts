// polymarket-nvidia-ceo-forecast-01 entry: cross-sectional volatility bands.
//
// Every minute's price is scored on its own, so the job is calibration, not a
// point guess: each market needs a band whose width suits how much that market
// actually moves. The house baseline gives every market one sigma (0.0025 per
// sqrt-minute); here each market's sigma comes from its own recent realized
// volatility, taken relative to the median market of the same case and raised
// to a power, so quiet markets get a narrow band and jumpy ones a wide one
// while the case's overall scale stays in the range the recorder's grid needs.
//
// band(h) = x + z * sigma * sqrt(h), clamped to [0,1], 6 decimals,
// z = the standard normal's quantile at 0.05/0.25/0.5/0.75/0.95,
// sigma = BASE * (vol20(market) / vol20-median(case))^GAMMA, clamped 0.05..20.
// Only the case's own prices are used: no network, no clock, no randomness, so
// two runs of a case are byte-identical.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scored levels' standard-normal quantiles, in row order. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Realized-volatility window, in minutes. */
const WINDOW = 20;
/** Sigma of the median market, in price units per sqrt-minute. */
const BASE = 0.0003;
/** How hard the relative volatility stretches sigma. */
const GAMMA = 0.75;
/** Clamp on the relative factor, so one wild market cannot run away. */
const REL_MIN = 0.05;
const REL_MAX = 20;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  markets: CaseMarket[];
}

const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** Mean absolute minute move over the tail, 0 when the tail is shorter than 2. */
function realizedVol(prices: number[]): number {
  const tail = prices.length > WINDOW ? prices.slice(prices.length - WINDOW) : prices;
  if (tail.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < tail.length; i++) sum += Math.abs((tail[i] as number) - (tail[i - 1] as number));
  return sum / (tail.length - 1);
}

/** The case's median realized volatility, the yardstick every market is measured against. */
function medianVol(markets: CaseMarket[]): number {
  const vols = markets.map((m) => realizedVol(m.prices)).sort((a, b) => a - b);
  if (vols.length === 0) return 0;
  const mid = vols.length >> 1;
  return (vols.length % 2 === 0 ? ((vols[mid - 1] as number) + (vols[mid] as number)) / 2 : (vols[mid] as number));
}

/** One market's rows: its last price as the centre, sigma from its relative volatility. */
function forecast(m: CaseMarket, median: number, horizon: number): number[][] {
  const last = m.prices[m.prices.length - 1];
  if (last === undefined) throw new Error(`market ${m.id} has no prices`);
  const rel = median > 0 ? Math.min(REL_MAX, Math.max(REL_MIN, realizedVol(m.prices) / median)) : 1;
  const sigma = BASE * rel ** GAMMA;
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const spread = sigma * Math.sqrt(h);
    rows.push(Z.map((z) => price6(last + z * spread)));
  }
  return rows;
}

const files = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
mkdirSync(OUTPUT_DIR, { recursive: true });
for (const file of files) {
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  const median = medianVol(c.markets);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, median, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${file.slice(0, -3)}.out`), JSON.stringify({ forecasts }));
}
