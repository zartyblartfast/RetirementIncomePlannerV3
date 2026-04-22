import { describe, it, expect } from 'vitest';
import { suggestGrowthRates } from '../growthSuggestions';
import type { DCPotConfig, TaxFreeAccountConfig } from '../types';

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

type PotLike = Pick<DCPotConfig | TaxFreeAccountConfig, 'allocation' | 'holdings'>;

// ------------------------------------------------------------------ //
//  Template allocation
// ------------------------------------------------------------------ //

describe('suggestGrowthRates — template allocation (equity_100)', () => {
  const pot: PotLike = {
    allocation: { mode: 'template', template_id: 'equity_100' },
  };
  const result = suggestGrowthRates(pot);

  it('returns an object with low/mid/high/description/yearsOfData', () => {
    expect(result).toHaveProperty('low');
    expect(result).toHaveProperty('mid');
    expect(result).toHaveProperty('high');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('yearsOfData');
  });

  it('low < mid < high (monotonicity)', () => {
    expect(result.low).toBeLessThan(result.mid);
    expect(result.mid).toBeLessThan(result.high);
  });

  it('mid is positive for 100% equity allocation', () => {
    expect(result.mid).toBeGreaterThan(0);
  });

  it('yearsOfData is between 100 and 130', () => {
    expect(result.yearsOfData).toBeGreaterThanOrEqual(100);
    expect(result.yearsOfData).toBeLessThanOrEqual(130);
  });

  it('p25 is approximately -3% to +2% for global equity', () => {
    // expected ~-3.0% p25
    expect(result.low).toBeGreaterThan(-0.10);
    expect(result.low).toBeLessThan(0.03);
  });

  it('p75 is approximately +10% to +30% for global equity', () => {
    // expected ~+19.1% p75
    expect(result.high).toBeGreaterThan(0.08);
    expect(result.high).toBeLessThan(0.35);
  });

  it('description mentions allocation or years of data', () => {
    expect(result.description.length).toBeGreaterThan(10);
    expect(result.description).toMatch(/\d+\s*year/i);
  });
});

// ------------------------------------------------------------------ //
//  Custom allocation
// ------------------------------------------------------------------ //

describe('suggestGrowthRates — custom allocation (60/40)', () => {
  const pot: PotLike = {
    allocation: {
      mode: 'custom',
      custom_weights: { global_equity: 0.6, investment_grade_bonds: 0.4 },
    },
  };
  const result = suggestGrowthRates(pot);

  it('low < mid < high (monotonicity)', () => {
    expect(result.low).toBeLessThan(result.mid);
    expect(result.mid).toBeLessThan(result.high);
  });

  it('mid is positive for 60/40 allocation', () => {
    expect(result.mid).toBeGreaterThan(0);
  });

  it('yearsOfData is between 100 and 130', () => {
    expect(result.yearsOfData).toBeGreaterThanOrEqual(100);
    expect(result.yearsOfData).toBeLessThanOrEqual(130);
  });

  it('mid is lower than pure equity mid', () => {
    const equityPot: PotLike = {
      allocation: { mode: 'template', template_id: 'equity_100' },
    };
    const equityResult = suggestGrowthRates(equityPot);
    // bonds dilute returns, 60/40 should have lower mid than 100% equity
    expect(result.mid).toBeLessThan(equityResult.mid);
  });
});

// ------------------------------------------------------------------ //
//  No allocation — fallback to diversified_growth
// ------------------------------------------------------------------ //

describe('suggestGrowthRates — no allocation (fallback to diversified_growth)', () => {
  const pot: PotLike = {};
  const result = suggestGrowthRates(pot);

  it('low < mid < high (monotonicity)', () => {
    expect(result.low).toBeLessThan(result.mid);
    expect(result.mid).toBeLessThan(result.high);
  });

  it('mid is positive for default diversified_growth', () => {
    expect(result.mid).toBeGreaterThan(0);
  });

  it('yearsOfData is between 100 and 130', () => {
    expect(result.yearsOfData).toBeGreaterThanOrEqual(100);
    expect(result.yearsOfData).toBeLessThanOrEqual(130);
  });

  it('description mentions default or fallback', () => {
    expect(result.description.toLowerCase()).toMatch(/default|fallback|diversified/);
  });

  it('p50 is approximately +4% to +10% for diversified_growth', () => {
    // expected ~+6.1% p50
    expect(result.mid).toBeGreaterThan(0.03);
    expect(result.mid).toBeLessThan(0.12);
  });
});

// ------------------------------------------------------------------ //
//  Holdings-based allocation
// ------------------------------------------------------------------ //

describe('suggestGrowthRates — holdings-based allocation', () => {
  const pot: PotLike = {
    holdings: [
      { fund_name: 'Global Equity Fund', input_type: 'weight', input_value: '1.0', benchmark_key: 'global_equity', weight: 1.0 },
    ],
  };
  const result = suggestGrowthRates(pot);

  it('low < mid < high (monotonicity)', () => {
    expect(result.low).toBeLessThan(result.mid);
    expect(result.mid).toBeLessThan(result.high);
  });

  it('mid is positive for equity holdings', () => {
    expect(result.mid).toBeGreaterThan(0);
  });

  it('yearsOfData is between 100 and 130', () => {
    expect(result.yearsOfData).toBeGreaterThanOrEqual(100);
    expect(result.yearsOfData).toBeLessThanOrEqual(130);
  });
});

// ------------------------------------------------------------------ //
//  Sanity: known-range checks for diversified_growth
// ------------------------------------------------------------------ //

describe('suggestGrowthRates — diversified_growth sanity ranges', () => {
  const pot: PotLike = {
    allocation: { mode: 'template', template_id: 'default_like_diversified_growth' },
  };
  const result = suggestGrowthRates(pot);

  // Expected from pre-computed analysis: p25=-2.9% p50=+6.1% p75=+15.0% n=117
  it('p25 is near -2.9%', () => {
    expect(result.low).toBeGreaterThan(-0.06);
    expect(result.low).toBeLessThan(0.01);
  });

  it('p50 is near +6.1%', () => {
    expect(result.mid).toBeGreaterThan(0.03);
    expect(result.mid).toBeLessThan(0.10);
  });

  it('p75 is near +15.0%', () => {
    expect(result.high).toBeGreaterThan(0.09);
    expect(result.high).toBeLessThan(0.22);
  });
});

// ------------------------------------------------------------------ //
//  Test overrides (inject mock data)
// ------------------------------------------------------------------ //

describe('suggestGrowthRates — override injection (unit test isolation)', () => {
  // Minimal synthetic data: 4 years with known real returns
  // For global_equity: blended = 0.7*us_eq + 0.3*uk_eq_total
  // Year A: blended = 0.10, cpi = 0.02 → real = 0.08
  // Year B: blended = 0.20, cpi = 0.02 → real = 0.18
  // Year C: blended = -0.05, cpi = 0.02 → real = -0.07
  // Year D: blended = 0.15, cpi = 0.02 → real = 0.13
  // Sorted reals: [-0.07, 0.08, 0.13, 0.18]
  // p25 via linear interp at idx=0.75: -0.07 + 0.75*(0.08-(-0.07)) = -0.07 + 0.1125 = 0.0425
  // p50 at idx=1.5:  0.08 + 0.5*(0.13-0.08) = 0.08 + 0.025 = 0.105
  // p75 at idx=2.25: 0.13 + 0.25*(0.18-0.13) = 0.13 + 0.0125 = 0.1425

  const mockHistorical = {
    metadata: {},
    annual_returns: {
      '2000': { us_equity: 0.094286, uk_equity_total: 0.114286, uk_cpi: 0.02 },
      // 0.7*0.094286 + 0.3*0.114286 = 0.066+0.034286 = 0.100286 ~ 0.10; real = 0.08
      '2001': { us_equity: 0.194286, uk_equity_total: 0.214286, uk_cpi: 0.02 },
      // 0.7*0.194286 + 0.3*0.214286 = 0.136+0.064286 = 0.200286 ~ 0.20; real = 0.18
      '2002': { us_equity: -0.054286, uk_equity_total: -0.034286, uk_cpi: 0.02 },
      // 0.7*(-0.054286) + 0.3*(-0.034286) = -0.038+(-0.010286) = -0.048286 ~ -0.05; real = -0.07
      '2003': { us_equity: 0.144286, uk_equity_total: 0.164286, uk_cpi: 0.02 },
      // 0.7*0.144286 + 0.3*0.164286 = 0.101+0.049286 = 0.150286 ~ 0.15; real = 0.13
    },
  };

  const mockAssetModel = {
    benchmark_mappings: { global_equity: 'global_equity' },
    historical_data_mapping: {
      global_equity: {
        method: 'blend',
        components: [
          { series: 'us_equity', weight: 0.7 },
          { series: 'uk_equity_total', weight: 0.3 },
        ],
      },
    },
    portfolio_templates: [
      {
        id: 'test_equity',
        label: 'Test 100% Equity',
        weights: [{ asset_class_id: 'global_equity', weight: 1.0 }],
      },
    ],
  };

  const pot: PotLike = {
    allocation: { mode: 'template', template_id: 'test_equity' },
  };
  const result = suggestGrowthRates(pot, mockAssetModel, mockHistorical);

  it('yearsOfData equals 4 from mock data', () => {
    expect(result.yearsOfData).toBe(4);
  });

  it('low < mid < high from mock data', () => {
    expect(result.low).toBeLessThan(result.mid);
    expect(result.mid).toBeLessThan(result.high);
  });

  it('p50 is approximately 0.105 from mock data', () => {
    expect(result.mid).toBeCloseTo(0.105, 2);
  });

  it('p25 is approximately 0.0425 from mock data', () => {
    expect(result.low).toBeCloseTo(0.0425, 2);
  });

  it('p75 is approximately 0.1425 from mock data', () => {
    expect(result.high).toBeCloseTo(0.1425, 2);
  });
});
