import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALLOCATION_TEMPLATE_ID,
  allocationFromTemplate,
  customAllocationFromExisting,
  customWeightTotal,
  defaultGrowthRateFromAllocation,
  getAssetClassOptions,
  getPortfolioTemplateOptions,
  makeDefaultAllocation,
  normalizeConfigAssetAllocations,
  normalizeAllocation,
} from '../assetAllocation';
import { suggestGrowthRates } from '../growthSuggestions';
import type { PlannerConfig } from '../types';

describe('asset allocation helpers', () => {
  it('uses diversified growth as the default allocation template', () => {
    expect(makeDefaultAllocation()).toEqual({
      mode: 'template',
      template_id: DEFAULT_ALLOCATION_TEMPLATE_ID,
    });
  });

  it('exposes portfolio templates and asset classes for the user/adviser selector', () => {
    expect(getPortfolioTemplateOptions().map((template) => template.id)).toContain(DEFAULT_ALLOCATION_TEMPLATE_ID);
    expect(getAssetClassOptions().map((assetClass) => assetClass.id)).toEqual(
      expect.arrayContaining([
        'global_equity',
        'diversified_growth',
        'investment_grade_bonds',
        'inflation_linked_bonds',
        'cash',
        'property',
      ]),
    );
  });

  it('normalizes missing pot and ISA allocations without changing existing valid growth fields', () => {
    const cfg = {
      personal: { date_of_birth: '1965-01', retirement_date: '2032-01', end_age: 90, currency: 'GBP' },
      target_income: { net_annual: 25000, cpi_rate: 0.025 },
      guaranteed_income: [],
      dc_pots: [{ name: 'DC', starting_balance: 100000, growth_rate: 0.04, annual_fees: 0.005, tax_free_portion: 0.25 }],
      tax_free_accounts: [{ name: 'ISA', starting_balance: 20000, growth_rate: 0.035 }],
      withdrawal_priority: ['DC', 'ISA'],
      tax: { regime: 'Custom', personal_allowance: 12570, bands: [] },
    } satisfies PlannerConfig;

    const normalized = normalizeConfigAssetAllocations(cfg);

    expect(normalized.dc_pots[0]?.allocation).toEqual(makeDefaultAllocation());
    expect(normalized.tax_free_accounts[0]?.allocation).toEqual(makeDefaultAllocation());
    expect(normalized.dc_pots[0]?.growth_rate).toBe(0.04);
    expect(normalized.tax_free_accounts[0]?.growth_rate).toBe(0.035);
    expect(normalized.dc_pots[0]?.name).toBe('DC');
    expect(normalized.tax_free_accounts[0]?.name).toBe('ISA');
  });

  it('fills missing or invalid growth fields from the default allocation suggestion', () => {
    const cfg = {
      personal: { date_of_birth: '1965-01', retirement_date: '2032-01', end_age: 90, currency: 'GBP' },
      target_income: { net_annual: 25000, cpi_rate: 0.025 },
      guaranteed_income: [],
      dc_pots: [{ name: 'DC', starting_balance: 100000, growth_rate: Number.NaN, annual_fees: 0.005, tax_free_portion: 0.25 }],
      tax_free_accounts: [{ name: 'ISA', starting_balance: 20000 } as PlannerConfig['tax_free_accounts'][number]],
      withdrawal_priority: ['DC', 'ISA'],
      tax: { regime: 'Custom', personal_allowance: 12570, bands: [] },
    } satisfies PlannerConfig;

    const normalized = normalizeConfigAssetAllocations(cfg);
    const expected = defaultGrowthRateFromAllocation(makeDefaultAllocation());

    expect(normalized.dc_pots[0]?.growth_rate).toBeCloseTo(expected);
    expect(normalized.tax_free_accounts[0]?.growth_rate).toBeCloseTo(expected);
  });

  it('derives the auto-filled growth rate from the selected allocation mid suggestion', () => {
    const allocation = allocationFromTemplate('balanced_60_40');

    expect(defaultGrowthRateFromAllocation(allocation)).toBeCloseTo(
      suggestGrowthRates({ allocation }).mid,
    );
  });

  it('preserves explicit template and custom allocation choices', () => {
    expect(normalizeAllocation(allocationFromTemplate('equity_100'))).toEqual({
      mode: 'template',
      template_id: 'equity_100',
      manual_override: true,
    });

    const custom = normalizeAllocation({
      mode: 'custom',
      custom_weights: { global_equity: 0.6, cash: 0.4 },
    });

    expect(custom).toEqual({
      mode: 'custom',
      custom_weights: { global_equity: 0.6, cash: 0.4 },
      manual_override: true,
    });
    expect(customWeightTotal(custom)).toBeCloseTo(1);
  });

  it('starts a new custom allocation from the currently selected template weights', () => {
    const custom = customAllocationFromExisting({ allocation: allocationFromTemplate('balanced_60_40') });

    expect(custom).toEqual({
      mode: 'custom',
      custom_weights: { global_equity: 0.6, investment_grade_bonds: 0.4 },
      manual_override: true,
    });
  });
});
