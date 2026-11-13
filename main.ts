// polymarket-nvidia-ceo-forecast-01 entry: volatility-scaled persistence.
//
// Each market's minute-to-minute price is close to a random walk with a *per
// market* step size: quiet markets barely tick, jumpy ones move in bursts. The
// house baseline gives every market one sigma (0.0025); this entry instead
// estimates each market's own step size from its recent realized volatility and
// scales the band around that, which is what the pinball loss rewards - narrow
// where the price is calm, wide where it moves. No network, no clock, no RNG:
// only the case's prices, so two runs are byte-identical.
//
// band(h) = x + z * sigma * sqrt(h), clamped to [0,1], 6 decimals,
// z = the standard normal's quantile at 0.05/0.25/0.5/0.75/0.95,
// sigma = SCALE * (0.8 * fast vol + 0.2 * slow vol), both mean |minute move|.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scored levels' standard-normal quantiles, in row order. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Fast and slow realized-volatility windows, in minutes, and their weights. */
const WINDOW_FAST = 20;
const WINDOW_SLOW = 240;
const MIX_SLOW = 0.2;
/** Multiple of realized volatility. */
const SCALE = 0.08;
/** Sigma floor, so a dead-flat market still carries a small band. */
const FLOOR = 0.00001;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  markets: CaseMarket[];
}

const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** Mean absolute minute move over the last `window` minutes, 0 under 2 prices. */
function realizedVol(prices: number[], window: number): number {
  const tail = prices.length > window ? prices.slice(prices.length - window) : prices;
  if (tail.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < tail.length; i++) sum += Math.abs((tail[i] as number) - (tail[i - 1] as number));
  return sum / (tail.length - 1);
}

/** One market's horizon rows: the band around its last price, widening with sqrt(h). */
function forecast(m: CaseMarket, horizon: number): number[][] {
  const last = m.prices[m.prices.length - 1];
  if (last === undefined) throw new Error(`market ${m.id} has no prices`);
  const vol = (1 - MIX_SLOW) * realizedVol(m.prices, WINDOW_FAST) + MIX_SLOW * realizedVol(m.prices, WINDOW_SLOW);
  const sigma = Math.max(FLOOR, SCALE * vol);
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
  const raw = readFileSync(join(INPUT_DIR, file), 'utf8');
  const c = JSON.parse(raw) as Case;
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${file.slice(0, -3)}.out`), JSON.stringify({ forecasts }));
}
