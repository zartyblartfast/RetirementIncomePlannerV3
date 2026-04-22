/**
 * growthSuggestions.ts
 *
 * Computes allocation-weighted p25/p50/p75 REAL (inflation-adjusted) historical
 * returns for a DC pot or ISA, to power the "Suggest growth rate" feature.
 *
 * Real return = blended nominal return − uk_cpi for that year.
 * Spread is derived from empirical historical distribution, not volatility estimates.
 */

import type { DCPotConfig, TaxFreeAccountConfig } from './types';
import defaultAssetModel from './data/asset_model.json';
import defaultHistoricalData from './data/historical_returns.json';

// ------------------------------------------------------------------ //
//  Internal data-shape types
// ------------------------------------------------------------------ //

interface BlendComponent { series: string; weight: number }

interface MappingSingle  { method: 'single';  series: string; fallback?: string | null }
interface MappingBlend   { method: 'blend';   components: BlendComponent[]; fallback?: string | null }
interface MappingDerived { method: 'derived'; formula: string }
type AssetMapping = MappingSingle | MappingBlend | MappingDerived;

interface PortfolioTemplate {
  id: string;
  label: string;
  weights: Array<{ asset_class_id: string; weight: number }>;
}

interface AssetModelShape {
  benchmark_mappings: Record<string, string>;
  historical_data_mapping: Record<string, AssetMapping>;
  portfolio_templates: PortfolioTemplate[];
  [key: string]: unknown;
}

interface HistoricalDataShape {
  metadata: unknown;
  annual_returns: Record<string, Record<string, number>>;
}

// ------------------------------------------------------------------ //
//  Public interface
// ------------------------------------------------------------------ //

export interface GrowthSuggestion {
  low:         number;   // p25 real return (e.g. -0.03 = -3%)
  mid:         number;   // p50 real return
  high:        number;   // p75 real return
  description: string;   // human-readable summary
  yearsOfData: number;
}

// ------------------------------------------------------------------ //
//  Percentile helper (linear interpolation, matches numpy default)
// ------------------------------------------------------------------ //

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

// ------------------------------------------------------------------ //
//  Asset-class return resolver (uses the JSON mapping definitions)
// ------------------------------------------------------------------ //

function resolveAC(
  acId: string,
  entry: Record<string, number>,
  hdm: Record<string, AssetMapping>,
): number | null {
  const mapping = hdm[acId];
  if (!mapping) return null;

  if (mapping.method === 'single') {
    const v = entry[mapping.series];
    if (v !== undefined) return v;
    if (mapping.fallback) return entry[mapping.fallback] ?? null;
    return null;
  }

  if (mapping.method === 'blend') {
    let total = 0, totalW = 0;
    for (const c of mapping.components) {
      let val: number | null;
      if (c.series.startsWith('_')) {
        val = resolveAC(c.series.slice(1), entry, hdm);
      } else {
        val = entry[c.series] ?? null;
      }
      if (val !== null) { total += c.weight * val; totalW += c.weight; }
    }
    if (totalW === 0) {
      if ((mapping as MappingBlend).fallback) return entry[(mapping as MappingBlend).fallback!] ?? null;
      return null;
    }
    const fullW = mapping.components.reduce((s, c) => s + c.weight, 0);
    return (total / totalW) * fullW;
  }

  if (mapping.method === 'derived') {
    const formula = (mapping as MappingDerived).formula ?? '';
    if (formula.includes(' - ')) {
      const parts = formula.split(' - ');
      const a = entry[parts[0]!.trim()];
      const b = entry[parts[1]!.trim()];
      if (a !== undefined && b !== undefined) return a - b;
    }
    return null;
  }

  return null;
}

// ------------------------------------------------------------------ //
//  Resolve allocation → weight map
// ------------------------------------------------------------------ //

type PotInput = Pick<DCPotConfig | TaxFreeAccountConfig, 'allocation' | 'holdings'>;

function resolveWeights(
  pot: PotInput,
  am: AssetModelShape,
): { weights: Record<string, number>; label: string; isDefault: boolean } {
  const holdings = pot.holdings ?? [];
  if (holdings.length > 0) {
    const weights: Record<string, number> = {};
    const bm = am.benchmark_mappings;
    let totalW = 0;
    for (const h of holdings) {
      const acId = bm[h.benchmark_key];
      if (acId) {
        weights[acId] = (weights[acId] ?? 0) + h.weight;
        totalW += h.weight;
      }
    }
    if (totalW > 0) {
      return { weights, label: 'your holdings', isDefault: false };
    }
  }

  const alloc = pot.allocation;
  if (alloc?.mode === 'template' && alloc.template_id) {
    const tmpl = am.portfolio_templates.find(t => t.id === alloc.template_id);
    if (tmpl) {
      const weights: Record<string, number> = {};
      for (const w of tmpl.weights) weights[w.asset_class_id] = w.weight;
      return { weights, label: tmpl.label, isDefault: false };
    }
  }

  if (alloc?.mode === 'custom' && alloc.custom_weights) {
    return { weights: alloc.custom_weights, label: 'your custom allocation', isDefault: false };
  }

  // Fallback
  return {
    weights: { diversified_growth: 1.0 },
    label: 'Diversified Growth (default)',
    isDefault: true,
  };
}

// ------------------------------------------------------------------ //
//  Main export
// ------------------------------------------------------------------ //

export function suggestGrowthRates(
  potConfig: PotInput,
  assetModelOverride?: unknown,
  historicalReturnsOverride?: unknown,
): GrowthSuggestion {
  const am       = (assetModelOverride    ?? defaultAssetModel)    as AssetModelShape;
  const histData = (historicalReturnsOverride ?? defaultHistoricalData) as HistoricalDataShape;
  const hdm      = am.historical_data_mapping as Record<string, AssetMapping>;

  const { weights, label, isDefault } = resolveWeights(potConfig, am);

  const realReturns: number[] = [];

  for (const [yearStr, entry] of Object.entries(histData.annual_returns)) {
    const cpi = entry['uk_cpi'];
    if (cpi === undefined) continue;

    let blendedNominal = 0;
    let blendedWeight  = 0;
    let skip = false;

    for (const [acId, w] of Object.entries(weights)) {
      if (w === 0) continue;
      const r = resolveAC(acId, entry, hdm);
      if (r === null) { skip = true; break; }
      blendedNominal += w * r;
      blendedWeight  += w;
    }

    if (skip || blendedWeight === 0) continue;

    // Normalise if weights don't sum to 1 (e.g. partial data)
    const nominalReturn = blendedNominal / blendedWeight * Object.values(weights).reduce((s, w) => s + w, 0);
    // Simpler: blended / blendedWeight already gives the weighted mean;
    // we want the true weighted sum, so scale back:
    const nominalMean = blendedNominal / blendedWeight;
    const realReturn  = nominalMean - cpi;
    realReturns.push(realReturn);
    void yearStr; // suppress lint
  }

  realReturns.sort((a, b) => a - b);
  const n = realReturns.length;

  const low  = percentile(realReturns, 25);
  const mid  = percentile(realReturns, 50);
  const high = percentile(realReturns, 75);

  const defaultNote = isDefault ? ' (default — no allocation set)' : '';
  const description =
    `Based on ${n} years of real returns for ${label}${defaultNote}`;

  return { low, mid, high, description, yearsOfData: n };
}
