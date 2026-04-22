/**
 * growthSuggestions.ts
 *
 * Derives empirical p25/p50/p75 real-return suggestions for a given
 * pot (AllocationConfig or holdings) by replaying the full historical_returns
 * dataset (1900–present) and computing percentiles of blended real annual returns.
 */

import type { AllocationConfig, HoldingConfig } from './types';
import historicalReturnsJson from './data/historical_returns.json';
import assetModelJson from './data/asset_model.json';

// ------------------------------------------------------------------ //
//  Exported return type
// ------------------------------------------------------------------ //

export interface GrowthSuggestion {
  /** p25 real return — e.g. -0.03 means -3% */
  low: number;
  /** p50 real return */
  mid: number;
  /** p75 real return */
  high: number;
  /** Human-readable description of the source data */
  description: string;
  /** Number of valid years used in the calculation */
  yearsOfData: number;
  /** True when no allocation was provided and we defaulted to diversified_growth */
  usingFallback: boolean;
}

// ------------------------------------------------------------------ //
//  PotLike — the argument shape accepted by suggestGrowthRates
// ------------------------------------------------------------------ //

export interface PotLike {
  allocation?: AllocationConfig;
  holdings?: HoldingConfig[];
}

// ------------------------------------------------------------------ //
//  Internal shape types for the JSON data files
// ------------------------------------------------------------------ //

interface HistDataMappingSingle {
  method: 'single';
  series: string;
  fallback?: string | null;
}

interface HistDataMappingBlend {
  method: 'blend';
  components: Array<{ series: string; weight: number }>;
  fallback?: string | null;
}

interface HistDataMappingDerived {
  method: 'derived';
  formula: string;
  fallback?: string | null;
}

type HistDataMapping =
  | HistDataMappingSingle
  | HistDataMappingBlend
  | HistDataMappingDerived;

interface PortfolioTemplate {
  id: string;
  label: string;
  weights: Array<{ asset_class_id: string; weight: number }>;
}

interface AssetModel {
  historical_data_mapping: Record<string, HistDataMapping>;
  portfolio_templates: PortfolioTemplate[];
  [key: string]: unknown;
}

interface HistoricalReturns {
  annual_returns: Record<string, Record<string, number | null>>;
  [key: string]: unknown;
}

// ------------------------------------------------------------------ //
//  Cast imported JSON to typed forms
// ------------------------------------------------------------------ //

const defaultHistoricalReturns = historicalReturnsJson as unknown as HistoricalReturns;
const defaultAssetModel = assetModelJson as unknown as AssetModel;

// ------------------------------------------------------------------ //
//  Inline percentile helper (linear interpolation — same as numpy default)
//  We do NOT import from backtest.ts to avoid circular dependency.
// ------------------------------------------------------------------ //

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

// ------------------------------------------------------------------ //
//  Resolve a single asset-class nominal return for a given year
// ------------------------------------------------------------------ //

function resolveAssetClassReturn(
  assetClassId: string,
  yearEntry: Record<string, number | null>,
  hdm: Record<string, HistDataMapping>,
): number | null {
  const mapping = hdm[assetClassId];
  if (!mapping) return null;

  if (mapping.method === 'single') {
    const val = yearEntry[mapping.series];
    if (val !== undefined && val !== null) return val;
    if (mapping.fallback) {
      const fb = yearEntry[mapping.fallback];
      return fb !== undefined && fb !== null ? fb : null;
    }
    return null;
  }

  if (mapping.method === 'blend') {
    let total = 0;
    let totalWeight = 0;
    for (const comp of mapping.components) {
      let val: number | null;
      if (comp.series.startsWith('_')) {
        // Recursive reference: "_global_equity" → resolves "global_equity"
        val = resolveAssetClassReturn(comp.series.slice(1), yearEntry, hdm);
      } else {
        const raw = yearEntry[comp.series];
        val = raw !== undefined && raw !== null ? raw : null;
      }
      if (val !== null) {
        total += comp.weight * val;
        totalWeight += comp.weight;
      }
    }
    if (totalWeight > 0) {
      // Scale back so partial availability doesn't inflate the return
      const fullWeight = mapping.components.reduce((s, c) => s + c.weight, 0);
      return (total / totalWeight) * fullWeight;
    }
    if (mapping.fallback) {
      const fb = yearEntry[mapping.fallback];
      return fb !== undefined && fb !== null ? fb : null;
    }
    return null;
  }

  if (mapping.method === 'derived') {
    const formula = mapping.formula ?? '';
    if (formula.includes(' - ')) {
      const parts = formula.split(' - ');
      const a = yearEntry[parts[0]!.trim()];
      const b = yearEntry[parts[1]!.trim()];
      if (a !== undefined && a !== null && b !== undefined && b !== null) {
        return a - b;
      }
    }
    return null;
  }

  return null;
}

// ------------------------------------------------------------------ //
//  Main exported function
// ------------------------------------------------------------------ //

/**
 * Suggest low/mid/high real growth rates for a given pot (containing
 * allocation and/or holdings) by computing empirical percentiles over
 * the full historical dataset.
 *
 * @param pot            Object with optional .allocation and/or .holdings
 * @param assetModelData Optional override for the asset model JSON (for testing)
 * @param historicalData Optional override for historical returns JSON (for testing)
 *
 * Returns GrowthSuggestion with p25 (low), p50 (mid), p75 (high) real returns
 * plus a human-readable description and metadata.
 */
export function suggestGrowthRates(
  pot: PotLike,
  assetModelData?: unknown,
  historicalData?: unknown,
): GrowthSuggestion {
  const am = (assetModelData as AssetModel | undefined) ?? defaultAssetModel;
  const hr = (historicalData as HistoricalReturns | undefined) ?? defaultHistoricalReturns;

  const hdm = am.historical_data_mapping;
  const templates = am.portfolio_templates ?? [];
  const annualReturns = hr.annual_returns;

  const allocation = pot.allocation;
  const holdings = pot.holdings;

  // ---- Step 1: Resolve weights map --------------------------------- //

  let weights: Record<string, number> = {};
  let descLabel = 'Diversified Growth (fallback)';
  let usingFallback = false;

  if (allocation) {
    if (allocation.mode === 'template' && allocation.template_id) {
      const tmpl = templates.find((t) => t.id === allocation.template_id);
      if (tmpl) {
        for (const tw of tmpl.weights) {
          weights[tw.asset_class_id] = tw.weight;
        }
        descLabel = tmpl.label;
      } else {
        // Template ID not found — fall back
        weights = { diversified_growth: 1.0 };
        usingFallback = true;
        descLabel = 'Diversified Growth (fallback — template not found)';
      }
    } else if (
      allocation.mode === 'custom' &&
      allocation.custom_weights &&
      Object.keys(allocation.custom_weights).length > 0
    ) {
      weights = { ...allocation.custom_weights };
      descLabel = 'Custom allocation';
    } else {
      // mode present but no usable data — fall back
      weights = { diversified_growth: 1.0 };
      usingFallback = true;
      descLabel = 'Diversified Growth (fallback)';
    }
  } else if (holdings && holdings.length > 0) {
    // Derive weights from holdings benchmark_key values
    for (const h of holdings) {
      if (h.benchmark_key && h.weight > 0) {
        weights[h.benchmark_key] = (weights[h.benchmark_key] ?? 0) + h.weight;
      }
    }
    if (Object.keys(weights).length === 0) {
      weights = { diversified_growth: 1.0 };
      usingFallback = true;
      descLabel = 'Diversified Growth (fallback)';
    } else {
      descLabel = 'Holdings-based allocation';
    }
  } else {
    // No allocation or holdings — fall back to diversified_growth
    weights = { diversified_growth: 1.0 };
    usingFallback = true;
    descLabel = 'Diversified Growth (fallback)';
  }

  // ---- Step 2: Iterate over every year and compute blended real returns -- //

  const realReturns: number[] = [];

  for (const yearStr of Object.keys(annualReturns)) {
    const yearEntry = annualReturns[yearStr]!;

    // Need uk_cpi to convert nominal → real
    const ukCpi = yearEntry['uk_cpi'];
    if (ukCpi === undefined || ukCpi === null) continue;

    // Compute blended nominal return across all asset classes
    let blendedNominal = 0;
    let blendedWeight = 0;
    let skip = false;

    for (const [assetClassId, w] of Object.entries(weights)) {
      if (w <= 0) continue;
      const nomRet = resolveAssetClassReturn(assetClassId, yearEntry, hdm);
      if (nomRet === null) {
        // Required asset class has no data for this year — skip year
        skip = true;
        break;
      }
      blendedNominal += w * nomRet;
      blendedWeight += w;
    }

    if (skip || blendedWeight === 0) continue;

    // Normalise in case weights don't sum exactly to 1 (defensive)
    const normalisedNominal = blendedNominal / blendedWeight;

    // Convert to real return: real ≈ nominal − inflation
    const realReturn = normalisedNominal - ukCpi;

    realReturns.push(realReturn);
  }

  // ---- Step 3: Compute percentiles --------------------------------- //

  const sorted = [...realReturns].sort((a, b) => a - b);

  const low = percentile(sorted, 25);
  const mid = percentile(sorted, 50);
  const high = percentile(sorted, 75);

  // ---- Step 4: Build description ----------------------------------- //

  const yearsOfData = sorted.length;
  const description =
    `Based on ${yearsOfData} years of real returns for ${descLabel}`;

  return { low, mid, high, description, yearsOfData, usingFallback };
}
