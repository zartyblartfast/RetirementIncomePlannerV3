/**
 * Generate golden snapshot fixtures for all 6 drawdown strategies.
 *
 * Run: npx tsx src/engine/__tests__/golden/generate.ts
 * Then re-run tests: npx vitest run
 */
import * as fs from 'fs';
import * as path from 'path';
import type { PlannerConfig, YearRow, ProjectionSummary } from '../../types';
import { runProjection } from '../../projection';
import { normalizeConfig } from '../../strategies';
import { makeExtendedConfig, validateConfig } from '../../validation';

// ---------- Base config ----------
const BASE_CONFIG: PlannerConfig = {
  personal: {
    date_of_birth: '1960-01',
    retirement_date: '2028-01',
    end_age: 78,
    currency: 'GBP',
  },
  target_income: {
    net_annual: 20000,
    cpi_rate: 0.02,
  },
  guaranteed_income: [
    {
      name: 'State Pension',
      gross_annual: 11500,
      indexation_rate: 0.02,
      taxable: true,
      start_date: '2028-01',
      values_as_of: '2028-01',
    },
  ],
  dc_pots: [
    {
      name: 'Employer',
      starting_balance: 80000,
      growth_rate: 0.04,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2028-01',
    },
  ],
  tax_free_accounts: [
    {
      name: 'ISA',
      starting_balance: 50000,
      growth_rate: 0.04,
      values_as_of: '2028-01',
    },
  ],
  withdrawal_priority: ['Employer', 'ISA'],
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
};

// ---------- Per-strategy overrides ----------
const STRATEGY_CONFIGS: Record<string, Partial<PlannerConfig>> = {
  fixed_target: {
    drawdown_strategy: 'fixed_target',
    drawdown_strategy_params: { net_annual: 20000 },
  },
  fixed_percentage: {
    drawdown_strategy: 'fixed_percentage',
    drawdown_strategy_params: { withdrawal_rate: 4.0 },
  },
  vanguard_dynamic: {
    drawdown_strategy: 'vanguard_dynamic',
    drawdown_strategy_params: {
      initial_target: 20000,
      max_increase_pct: 5.0,
      max_decrease_pct: 2.5,
    },
  },
  guyton_klinger: {
    drawdown_strategy: 'guyton_klinger',
    drawdown_strategy_params: {
      initial_target: 20000,
      upper_guardrail_pct: 5.5,
      lower_guardrail_pct: 3.5,
      raise_pct: 10.0,
      cut_pct: 10.0,
    },
  },
  arva: {
    drawdown_strategy: 'arva',
    drawdown_strategy_params: { assumed_real_return_pct: 3.0 },
  },
  arva_guardrails: {
    drawdown_strategy: 'arva_guardrails',
    drawdown_strategy_params: {
      assumed_real_return_pct: 3.0,
      max_annual_increase_pct: 10.0,
      max_annual_decrease_pct: 10.0,
    },
  },
};

// Shortfall config: fixed_target with low balance
const SHORTFALL_CONFIG: PlannerConfig = {
  personal: {
    date_of_birth: '1960-01',
    retirement_date: '2028-01',
    end_age: 78,
    currency: 'GBP',
  },
  target_income: { net_annual: 15000, cpi_rate: 0.0 },
  guaranteed_income: [],
  dc_pots: [],
  tax_free_accounts: [
    {
      name: 'ISA',
      starting_balance: 30000,
      growth_rate: 0.0,
      values_as_of: '2028-01',
    },
  ],
  withdrawal_priority: ['ISA'],
  tax: BASE_CONFIG.tax,
  drawdown_strategy: 'fixed_target',
  drawdown_strategy_params: { net_annual: 15000 },
};

// ---------- Helpers ----------
interface YearSnapshot {
  age: number;
  target_net: number;
  net_income_achieved: number;
  total_capital: number;
  shortfall: boolean;
}

interface SummarySnapshot {
  sustainable: boolean;
  first_shortfall_age: number | null;
  remaining_capital: number;
  end_age: number;
}

function extractYear(yr: YearRow): YearSnapshot {
  return {
    age: yr.age,
    target_net: Math.round(yr.target_net * 100) / 100,
    net_income_achieved: Math.round(yr.net_income_achieved * 100) / 100,
    total_capital: Math.round(yr.total_capital * 100) / 100,
    shortfall: yr.shortfall,
  };
}

function extractSummary(s: ProjectionSummary): SummarySnapshot {
  return {
    sustainable: s.sustainable,
    first_shortfall_age: s.first_shortfall_age,
    remaining_capital: Math.round(s.remaining_capital * 100) / 100,
    end_age: s.end_age,
  };
}

function generateFixture(name: string, inputCfg: PlannerConfig) {
  const cfg: PlannerConfig = JSON.parse(JSON.stringify(inputCfg));
  normalizeConfig(cfg);

  const errors = validateConfig(cfg);
  if (errors.length > 0) {
    console.warn(`  ${name}: config validation warnings:`, errors);
  }

  const result = runProjection(cfg);
  const extCfg = makeExtendedConfig(cfg);
  const extResult = runProjection(extCfg);

  const planEnd = cfg.personal.end_age;
  const normalYears = result.years.map(extractYear);
  const extYearsWithinPlan = extResult.years
    .filter(y => y.age <= planEnd)
    .map(extractYear);
  const extYearsAll = extResult.years.map(extractYear);

  return {
    name,
    config: cfg,
    summary: extractSummary(result.summary),
    years: normalYears,
    ext_summary: extractSummary(extResult.summary),
    ext_years: extYearsAll,
    parity_check: {
      plan_end_age: planEnd,
      normal_year_count: normalYears.length,
      ext_years_within_plan_count: extYearsWithinPlan.length,
      years_match: JSON.stringify(normalYears) === JSON.stringify(extYearsWithinPlan),
    },
  };
}

// ---------- Main ----------
const outDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

for (const [sid, overrides] of Object.entries(STRATEGY_CONFIGS)) {
  const cfg: PlannerConfig = { ...JSON.parse(JSON.stringify(BASE_CONFIG)), ...overrides };
  const fixture = generateFixture(sid, cfg);
  const filePath = path.join(outDir, `${sid}.json`);
  fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2));
  const parity = fixture.parity_check;
  const status = parity.years_match ? 'MATCH' : 'MISMATCH';
  console.log(`  ${sid}: sustainable=${fixture.summary.sustainable}, remaining=£${fixture.summary.remaining_capital.toFixed(0)}, ext_parity=${status}`);
}

// Shortfall fixture
const shortfallFixture = generateFixture('fixed_target_shortfall', SHORTFALL_CONFIG);
const shortfallPath = path.join(outDir, 'fixed_target_shortfall.json');
fs.writeFileSync(shortfallPath, JSON.stringify(shortfallFixture, null, 2));
console.log(`  fixed_target_shortfall: sustainable=${shortfallFixture.summary.sustainable}, shortfall_age=${shortfallFixture.summary.first_shortfall_age}`);

console.log(`\nGenerated ${Object.keys(STRATEGY_CONFIGS).length + 1} golden fixtures in ${outDir}`);
