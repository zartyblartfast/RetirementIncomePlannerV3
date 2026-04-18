/**
 * Diagnostic: Compare V1 output, V2 fixture config, and V2 UI default config.
 * Also manually verify key engine calculations.
 */
import { describe, it, expect } from 'vitest';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG as FIXTURE_CONFIG } from './fixtures';
import { DEFAULT_CONFIG as UI_CONFIG } from '../../store/configStore';
import type { PlannerConfig } from '../types';

// ------------------------------------------------------------------ //
//  V1 ACTIVE config (what V1 is actually running — config_active.json)
// ------------------------------------------------------------------ //
const V1_ACTIVE_CONFIG: PlannerConfig = {
  personal: {
    date_of_birth: '1958-07',
    retirement_date: '2027-04',
    retirement_age: 68,
    end_age: 92,
    currency: 'GBP',
  },
  target_income: {
    net_annual: 40000,
    cpi_rate: 0.03,
  },
  guaranteed_income: [
    {
      name: 'UK State Pension',
      gross_annual: 13680,
      indexation_rate: 0.035,
      end_age: null,
      taxable: true,
      values_as_of: '2025-03',
      start_date: '2025-03',
    },
    {
      name: 'BP Pension (DB)',
      gross_annual: 10052.28,
      indexation_rate: 0.03,
      end_age: null,
      taxable: true,
      values_as_of: '2025-03',
      start_date: '2025-03',
    },
  ],
  dc_pots: [
    {
      name: 'Consolidated DC Pot',
      starting_balance: 147000,
      growth_rate: 0.05,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2026-03',
    },
    {
      name: 'Employer DC Pot',
      starting_balance: 95000,
      growth_rate: 0.05,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2027-04',
    },
  ],
  tax_free_accounts: [
    {
      name: 'ISA',
      starting_balance: 45000,
      growth_rate: 0.05,
      values_as_of: '2027-04',
    },
  ],
  withdrawal_priority: ['Consolidated DC Pot', 'Employer DC Pot', 'ISA'],
  tax: {
    regime: 'Isle of Man',
    personal_allowance: 14500,
    bands: [
      { name: 'Lower rate', width: 6500, rate: 0.1 },
      { name: 'Higher rate', width: null, rate: 0.2 },
    ],
    tax_cap_enabled: false,
    tax_cap_amount: 200000,
  },
  drawdown_strategy: 'arva',
  drawdown_strategy_params: {
    assumed_real_return_pct: 3.0,
  },
};

// ------------------------------------------------------------------ //
//  V1 baseline (captured from Python engine with config_default.json)
// ------------------------------------------------------------------ //
const V1_SUMMARY = {
  sustainable: true,
  first_shortfall_age: null,
  end_age: 90,
  anchor_age: 68,
  num_years: 23,
  remaining_capital: 334976.62,
  total_tax_paid: 129055.25,
  avg_effective_tax_rate: 12.2,
  first_pot_exhausted_age: 82,
};

const V1_YEAR1 = {
  age: 68,
  target_net: 30000.0,
  net_income: 30410.53,
  guar_total: 25767.70,
  dc_gross: 7348.67,
  tf_wd: 0.0,
  tax: 2705.84,
  capital: 320401.06,
};

// @ts-expect-error kept as reference data for manual diagnostics
const _V1_YEARS_CAPITAL = [
  { age: 68, capital: 320401.06 },
  { age: 69, capital: 323823.21 },
  { age: 70, capital: 327078.96 },
  { age: 71, capital: 330156.54 },
  { age: 72, capital: 333043.67 },
  { age: 73, capital: 335727.55 },
  { age: 74, capital: 338194.86 },
  { age: 75, capital: 340431.70 },
  { age: 76, capital: 342423.64 },
  { age: 77, capital: 344155.63 },
  { age: 78, capital: 345612.03 },
  { age: 79, capital: 346776.57 },
  { age: 80, capital: 347632.31 },
  { age: 81, capital: 348161.67 },
  { age: 82, capital: 348346.36 },
  { age: 83, capital: 348167.40 },
  { age: 84, capital: 347605.05 },
  { age: 85, capital: 346638.83 },
  { age: 86, capital: 345247.47 },
  { age: 87, capital: 343408.90 },
  { age: 88, capital: 341100.22 },
  { age: 89, capital: 338297.67 },
  { age: 90, capital: 334976.62 },
];

// ------------------------------------------------------------------ //
//  Run V2 with fixture config (same as V1 config_default.json)
// ------------------------------------------------------------------ //
const fixtureResult = runProjection(FIXTURE_CONFIG);

// ------------------------------------------------------------------ //
//  Run V2 with UI default config (from configStore.ts)
// ------------------------------------------------------------------ //
const uiResult = runProjection(UI_CONFIG);

// ------------------------------------------------------------------ //
//  Test 1: V2 fixture config matches V1 (sanity check)
// ------------------------------------------------------------------ //
describe('Diagnostic — V2 fixture vs V1 baseline', () => {
  it('summary matches', () => {
    const fs = fixtureResult.summary;
    expect(fs.sustainable).toBe(V1_SUMMARY.sustainable);
    expect(fs.end_age).toBe(V1_SUMMARY.end_age);
    expect(fs.anchor_age).toBe(V1_SUMMARY.anchor_age);
    expect(fs.num_years).toBe(V1_SUMMARY.num_years);
    expect(fs.first_pot_exhausted_age).toBe(V1_SUMMARY.first_pot_exhausted_age);
    expect(Math.abs(fs.remaining_capital - V1_SUMMARY.remaining_capital)).toBeLessThan(50);
    expect(Math.abs(fs.total_tax_paid - V1_SUMMARY.total_tax_paid)).toBeLessThan(50);
  });
});

// ------------------------------------------------------------------ //
//  Test 2: V2 UI config vs V2 fixture config — find all differences
// ------------------------------------------------------------------ //
describe('Diagnostic — V2 UI config vs V2 fixture config', () => {
  it('config diff analysis', () => {
    // Dump the structural differences between the two configs
    const fixCfg: PlannerConfig = JSON.parse(JSON.stringify(FIXTURE_CONFIG));
    const uiCfg: PlannerConfig = JSON.parse(JSON.stringify(UI_CONFIG));

    console.log('\n=== CONFIG COMPARISON ===');

    // Personal
    console.log('\n--- Personal ---');
    console.log('  Fixture DOB:', fixCfg.personal.date_of_birth, '| UI DOB:', uiCfg.personal.date_of_birth);
    console.log('  Fixture ret_date:', fixCfg.personal.retirement_date, '| UI ret_date:', uiCfg.personal.retirement_date);
    console.log('  Fixture end_age:', fixCfg.personal.end_age, '| UI end_age:', uiCfg.personal.end_age);

    // Guaranteed income
    console.log('\n--- Guaranteed Income ---');
    for (let i = 0; i < Math.max(fixCfg.guaranteed_income.length, uiCfg.guaranteed_income.length); i++) {
      const fg = fixCfg.guaranteed_income[i];
      const ug = uiCfg.guaranteed_income[i];
      console.log(`  [${i}] Fixture:`, JSON.stringify(fg));
      console.log(`  [${i}] UI:     `, JSON.stringify(ug));
    }

    // DC Pots
    console.log('\n--- DC Pots ---');
    for (let i = 0; i < Math.max(fixCfg.dc_pots.length, uiCfg.dc_pots.length); i++) {
      const fp = fixCfg.dc_pots[i];
      const up = uiCfg.dc_pots[i];
      console.log(`  [${i}] Fixture:`, JSON.stringify(fp));
      console.log(`  [${i}] UI:     `, JSON.stringify(up));
    }

    // Tax
    console.log('\n--- Tax ---');
    console.log('  Fixture:', JSON.stringify(fixCfg.tax));
    console.log('  UI:     ', JSON.stringify(uiCfg.tax));

    // Strategy
    console.log('\n--- Strategy ---');
    console.log('  Fixture strategy:', fixCfg.drawdown_strategy ?? 'undefined (defaults to fixed_target)');
    console.log('  UI strategy:', uiCfg.drawdown_strategy ?? 'undefined (defaults to fixed_target)');

    expect(true).toBe(true); // Just for output
  });

  it('summary comparison', () => {
    const fs = fixtureResult.summary;
    const us = uiResult.summary;

    console.log('\n=== SUMMARY COMPARISON (Fixture vs UI) ===');
    console.log('  sustainable:         ', fs.sustainable, '|', us.sustainable);
    console.log('  first_shortfall_age: ', fs.first_shortfall_age, '|', us.first_shortfall_age);
    console.log('  anchor_age:          ', fs.anchor_age, '|', us.anchor_age);
    console.log('  num_years:           ', fs.num_years, '|', us.num_years);
    console.log('  remaining_capital:   ', fs.remaining_capital, '|', us.remaining_capital);
    console.log('  total_tax_paid:      ', fs.total_tax_paid, '|', us.total_tax_paid);
    console.log('  avg_effective_tax_rate:', fs.avg_effective_tax_rate, '|', us.avg_effective_tax_rate);
    console.log('  first_pot_exhausted: ', fs.first_pot_exhausted_age, '|', us.first_pot_exhausted_age);
    console.log('  depletion_events:    ', JSON.stringify(fs.depletion_events), '|', JSON.stringify(us.depletion_events));

    const capitalDiff = Math.abs(fs.remaining_capital - us.remaining_capital);
    console.log('\n  Capital difference: £', capitalDiff.toFixed(2));

    if (capitalDiff > 1) {
      console.log('  *** SIGNIFICANT DIFFERENCE DETECTED ***');
    } else {
      console.log('  Configs produce equivalent results');
    }

    expect(true).toBe(true); // Just for output
  });

  it('year-by-year comparison', () => {
    console.log('\n=== YEAR-BY-YEAR COMPARISON ===');
    console.log('Age | Fixture Capital | UI Capital | Diff | Fixture Target | UI Target | Fixture Net | UI Net');
    const maxYears = Math.max(fixtureResult.years.length, uiResult.years.length);
    for (let i = 0; i < maxYears; i++) {
      const fy = fixtureResult.years[i];
      const uy = uiResult.years[i];
      if (fy && uy) {
        const diff = uy.total_capital - fy.total_capital;
        console.log(
          `  ${fy.age} | ${fy.total_capital.toFixed(2)} | ${uy.total_capital.toFixed(2)} | ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} | ${fy.target_net.toFixed(2)} | ${uy.target_net.toFixed(2)} | ${fy.net_income_achieved.toFixed(2)} | ${uy.net_income_achieved.toFixed(2)}`
        );
      }
    }

    expect(true).toBe(true); // Just for output
  });
});

// ------------------------------------------------------------------ //
//  Test 3: Manual verification of Year 1 calculations
// ------------------------------------------------------------------ //
describe('Diagnostic — Manual verification of Year 1', () => {
  it('verify pre-anchor growth for DC pots', () => {
    // DOB: 1958-07, Retirement: 2027-04, values_as_of: 2025-03
    // anchorAbs = max(retAbs, latestAsof) = max(2027*12+3, 2025*12+2) = 24327
    // asofAbs = 2025*12+2 = 24302
    // gap = 24327 - 24302 = 25 months of pre-anchor growth

    const gap = 25;
    const annualGrowth = 0.04;
    const annualFees = 0.005;
    const monthlyGrowth = Math.pow(1 + annualGrowth, 1 / 12) - 1;
    const monthlyFees = Math.pow(1 + annualFees, 1 / 12) - 1;

    // Consolidated DC Pot: 180000
    let consolBal = 180000;
    for (let i = 0; i < gap; i++) {
      consolBal = consolBal * (1 + monthlyGrowth) - consolBal * monthlyFees;
    }

    // Employer DC Pot: 95000
    let emplBal = 95000;
    for (let i = 0; i < gap; i++) {
      emplBal = emplBal * (1 + monthlyGrowth) - emplBal * monthlyFees;
    }

    // ISA: 20000
    const isaGrowth = Math.pow(1 + 0.035, 1 / 12) - 1;
    let isaBal = 20000;
    for (let i = 0; i < gap; i++) {
      isaBal = isaBal * (1 + isaGrowth);
    }

    console.log('\n=== MANUAL PRE-ANCHOR GROWTH VERIFICATION ===');
    console.log('  Gap: 25 months (2025-03 to 2027-04)');
    console.log(`  Consol DC: 180000 → ${consolBal.toFixed(2)}`);
    console.log(`  Employer DC: 95000 → ${emplBal.toFixed(2)}`);
    console.log(`  ISA: 20000 → ${isaBal.toFixed(2)}`);
    console.log(`  Total start capital: ${(consolBal + emplBal + isaBal).toFixed(2)}`);

    // Compare with V2 fixture year 0 opening balances
    const y1 = fixtureResult.years[0]!;
    const openingConsol = y1.pot_pnl['Consolidated DC Pot']?.opening ?? 0;
    const openingEmpl = y1.pot_pnl['Employer DC Pot']?.opening ?? 0;
    const openingIsa = y1.pot_pnl['ISA']?.opening ?? 0;
    console.log(`  V2 opening Consol: ${openingConsol.toFixed(2)} (diff: ${(openingConsol - consolBal).toFixed(2)})`);
    console.log(`  V2 opening Employer: ${openingEmpl.toFixed(2)} (diff: ${(openingEmpl - emplBal).toFixed(2)})`);
    console.log(`  V2 opening ISA: ${openingIsa.toFixed(2)} (diff: ${(openingIsa - isaBal).toFixed(2)})`);

    // These should match within floating point precision
    expect(Math.abs(consolBal - openingConsol)).toBeLessThan(0.01);
    expect(Math.abs(emplBal - openingEmpl)).toBeLessThan(0.01);
    expect(Math.abs(isaBal - openingIsa)).toBeLessThan(0.01);
  });

  it('verify guaranteed income indexation', () => {
    // State Pension: 13680 @ 3.5%, values_as_of: 2025-03, anchor: 2027-04
    // gap = 25 months → annual indexed = 13680 * (1.035)^(25/12)
    const spIndexed = 13680 * Math.pow(1.035, 25 / 12);
    const spMonthly = spIndexed / 12;

    // BP Pension: 10052.28 @ 3.0%, same gap
    const bpIndexed = 10052.28 * Math.pow(1.03, 25 / 12);
    const bpMonthly = bpIndexed / 12;

    console.log('\n=== MANUAL GUARANTEED INCOME VERIFICATION ===');
    console.log(`  State Pension indexed annual: ${spIndexed.toFixed(2)}, monthly: ${spMonthly.toFixed(2)}`);
    console.log(`  BP Pension indexed annual: ${bpIndexed.toFixed(2)}, monthly: ${bpMonthly.toFixed(2)}`);

    // Year 1 accumulates 12 months of indexed income (plus monthly indexation during the year)
    // The V1 year 1 guaranteed totals: SP=14930.72, BP=10836.98, total=25767.70
    const y1 = fixtureResult.years[0]!;
    console.log(`  V2 Year 1 SP: ${y1.guaranteed_income['UK State Pension']?.toFixed(2)}`);
    console.log(`  V2 Year 1 BP: ${y1.guaranteed_income['BP Pension (DB)']?.toFixed(2)}`);
    console.log(`  V2 Year 1 total: ${y1.guaranteed_total.toFixed(2)}`);
    console.log(`  V1 Year 1 total: ${V1_YEAR1.guar_total}`);

    expect(Math.abs(y1.guaranteed_total - V1_YEAR1.guar_total)).toBeLessThan(1);
  });

  it('verify tax calculation for Year 1', () => {
    // IoM tax: PA=14500, lower band 6500@10%, higher band remainder@20%
    // V1 Year 1 total_taxable = 31279.20
    // After PA: 31279.20 - 14500 = 16779.20
    // Lower: min(16779.20, 6500) * 0.10 = 650
    // Higher: (16779.20 - 6500) * 0.20 = 10279.20 * 0.20 = 2055.84
    // Total tax = 650 + 2055.84 = 2705.84 ✓

    const taxable = 31279.20;
    const pa = 14500;
    const afterPa = Math.max(0, taxable - pa);
    const lowerTax = Math.min(afterPa, 6500) * 0.10;
    const higherTax = Math.max(0, afterPa - 6500) * 0.20;
    const totalTax = lowerTax + higherTax;

    console.log('\n=== MANUAL TAX VERIFICATION ===');
    console.log(`  Taxable: ${taxable}, After PA: ${afterPa}`);
    console.log(`  Lower band: ${lowerTax.toFixed(2)}, Higher band: ${higherTax.toFixed(2)}`);
    console.log(`  Total tax: ${totalTax.toFixed(2)} (V1: ${V1_YEAR1.tax})`);

    expect(Math.abs(totalTax - V1_YEAR1.tax)).toBeLessThan(0.01);
  });
});

// ------------------------------------------------------------------ //
//  Test 4: V2 with V1 ACTIVE config vs V1 Python output
//  This is the user's actual config — the one they see in the V1 app
// ------------------------------------------------------------------ //
const V1_ACTIVE_YEARS = [
  { age: 68, target: 40524.07, net: 40523.81, guar: 25767.70, dc_gross: 19246.66, tf_wd: 0, tax: 4490.54, capital: 287915.73 },
  { age: 69, target: 41299.14, net: 41298.89, guar: 26615.38, dc_gross: 19360.68, tf_wd: 0, tax: 4677.18, capital: 281300.84 },
  { age: 70, target: 42094.21, net: 42093.95, guar: 27491.11, dc_gross: 19471.84, tf_wd: 0, tax: 4869.00, capital: 274288.41 },
  { age: 71, target: 42909.69, net: 42909.44, guar: 28395.82, dc_gross: 19579.75, tf_wd: 0, tax: 5066.13, capital: 266864.57 },
  { age: 72, target: 43746.03, net: 43745.79, guar: 29330.46, dc_gross: 19684.02, tf_wd: 0, tax: 5268.69, capital: 259015.23 },
  { age: 73, target: 44603.62, net: 44603.37, guar: 30296.04, dc_gross: 19784.16, tf_wd: 0, tax: 5476.83, capital: 250726.23 },
  { age: 74, target: 45482.80, net: 45482.54, guar: 31293.59, dc_gross: 19879.62, tf_wd: 0, tax: 5690.66, capital: 241983.34 },
  { age: 75, target: 46383.91, net: 46383.66, guar: 32324.16, dc_gross: 19969.79, tf_wd: 0, tax: 5910.30, capital: 232772.39 },
  { age: 76, target: 47307.22, net: 47306.96, guar: 33388.87, dc_gross: 20053.96, tf_wd: 0, tax: 6135.87, capital: 223079.30 },
  { age: 77, target: 48252.92, net: 48252.66, guar: 34488.84, dc_gross: 20131.28, tf_wd: 0, tax: 6367.46, capital: 212890.30 },
  { age: 78, target: 49221.10, net: 49220.84, guar: 35625.25, dc_gross: 20200.75, tf_wd: 0, tax: 6605.16, capital: 202192.03 },
  { age: 79, target: 50211.71, net: 50211.45, guar: 36799.31, dc_gross: 20261.18, tf_wd: 0, tax: 6849.04, capital: 190971.82 },
  { age: 80, target: 51224.54, net: 51224.28, guar: 38012.28, dc_gross: 20311.12, tf_wd: 0, tax: 7099.13, capital: 179217.92 },
  { age: 81, target: 52259.14, net: 52258.88, guar: 39265.46, dc_gross: 20348.84, tf_wd: 0, tax: 7355.42, capital: 166919.91 },
  { age: 82, target: 53314.70, net: 53314.43, guar: 40560.18, dc_gross: 20372.11, tf_wd: 0, tax: 7617.85, capital: 154069.20 },
  { age: 83, target: 54389.93, net: 54389.67, guar: 41897.82, dc_gross: 20378.13, tf_wd: 0, tax: 7886.28, capital: 140659.74 },
  { age: 84, target: 55482.88, net: 55482.62, guar: 43279.83, dc_gross: 20363.24, tf_wd: 0, tax: 8160.45, capital: 126688.98 },
  { age: 85, target: 56590.57, net: 56590.31, guar: 44707.67, dc_gross: 20322.55, tf_wd: 0, tax: 8439.92, capital: 112159.31 },
  { age: 86, target: 57708.41, net: 57708.36, guar: 46182.88, dc_gross: 3884.88, tf_wd: 13909.91, tax: 6269.31, capital: 99548.76 },
  { age: 87, target: 59278.69, net: 59278.69, guar: 47707.04, dc_gross: 0, tf_wd: 17563.06, tax: 5991.41, capital: 86559.08 },
  { age: 88, target: 61036.76, net: 61036.77, guar: 49281.77, dc_gross: 0, tf_wd: 18061.35, tax: 6306.35, capital: 72410.13 },
  { age: 89, target: 62890.87, net: 62890.87, guar: 50908.77, dc_gross: 0, tf_wd: 18613.85, tax: 6631.75, capital: 56988.52 },
  { age: 90, target: 64873.52, net: 64873.53, guar: 52589.77, dc_gross: 0, tf_wd: 19251.70, tax: 6967.95, capital: 40143.30 },
  { age: 91, target: 67063.19, net: 67063.19, guar: 54326.59, dc_gross: 0, tf_wd: 20051.92, tax: 7315.32, capital: 21637.24 },
  { age: 92, target: 69766.79, net: 69766.78, guar: 56121.09, dc_gross: 0, tf_wd: 21319.92, tax: 7674.22, capital: 908.88 },
];

const activeResult = runProjection(V1_ACTIVE_CONFIG);

describe('Diagnostic — V2 with V1 ACTIVE config vs V1 Python', () => {
  it('summary comparison', () => {
    const s = activeResult.summary;
    console.log('\n=== V2 WITH V1 ACTIVE CONFIG — SUMMARY ===');
    console.log('  sustainable:', s.sustainable, '(V1: true)');
    console.log('  end_age:', s.end_age, '(V1: 92)');
    console.log('  anchor_age:', s.anchor_age, '(V1: 68)');
    console.log('  num_years:', s.num_years, '(V1: 25)');
    console.log('  remaining_capital:', s.remaining_capital, '(V1: 908.88)');
    console.log('  total_tax_paid:', s.total_tax_paid, '(V1: 161122.22)');
    console.log('  first_pot_exhausted:', s.first_pot_exhausted_age, '(V1: 77)');
    console.log('  depletion_events:', JSON.stringify(s.depletion_events));
    console.log('  V1 depletion: [Consolidated@77m8, Employer@86m3]');

    expect(s.sustainable).toBe(true);
    expect(s.end_age).toBe(92);
    expect(s.anchor_age).toBe(68);
    expect(s.num_years).toBe(25);
  });

  it('year-by-year comparison with V1 active output', () => {
    console.log('\n=== YEAR-BY-YEAR: V2 vs V1 ACTIVE ===');
    console.log('Age | V1 Capital  | V2 Capital  | Diff     | V1 Target  | V2 Target  | V1 DC Gross | V2 DC Gross');

    let maxCapDiff = 0;
    let maxCapDiffAge = 0;

    for (let i = 0; i < V1_ACTIVE_YEARS.length; i++) {
      const v1 = V1_ACTIVE_YEARS[i]!;
      const v2 = activeResult.years[i];
      if (v2) {
        const capDiff = v2.total_capital - v1.capital;
        if (Math.abs(capDiff) > Math.abs(maxCapDiff)) {
          maxCapDiff = capDiff;
          maxCapDiffAge = v1.age;
        }
        console.log(
          `  ${v1.age} | ${v1.capital.toFixed(2).padStart(10)} | ${v2.total_capital.toFixed(2).padStart(10)} | ${(capDiff >= 0 ? '+' : '') + capDiff.toFixed(2).padStart(8)} | ${v1.target.toFixed(2).padStart(9)} | ${v2.target_net.toFixed(2).padStart(9)} | ${v1.dc_gross.toFixed(2).padStart(10)} | ${v2.dc_withdrawal_gross.toFixed(2).padStart(10)}`
        );
      }
    }

    console.log(`\n  Max capital diff: £${maxCapDiff.toFixed(2)} at age ${maxCapDiffAge}`);

    // Check that V2 matches V1 within tolerance
    for (let i = 0; i < V1_ACTIVE_YEARS.length; i++) {
      const v1 = V1_ACTIVE_YEARS[i]!;
      const v2 = activeResult.years[i];
      if (v2) {
        expect(Math.abs(v2.total_capital - v1.capital)).toBeLessThan(100);
      }
    }
  });
});
