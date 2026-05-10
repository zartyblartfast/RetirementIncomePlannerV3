import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import { normalizeWithdrawalPriority } from '../withdrawalPriority';
import type { PlannerConfig } from '../types';
import { DEFAULT_CONFIG } from '../../store/configStore';

function baseConfig(): PlannerConfig {
  return {
    ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    dc_pots: [
      { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Workplace DC' },
      { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'SIPP' },
    ],
    tax_free_accounts: [
      { ...DEFAULT_CONFIG.tax_free_accounts[0]!, name: 'ISA' },
      { ...DEFAULT_CONFIG.tax_free_accounts[0]!, name: 'GIA tax-free wrapper' },
    ],
    withdrawal_priority: ['SIPP', 'ISA', 'Workplace DC', 'GIA tax-free wrapper'],
  };
}

describe('normalizeWithdrawalPriority', () => {
  it('preserves an existing valid order', () => {
    const cfg = baseConfig();

    expect(normalizeWithdrawalPriority(cfg)).toEqual([
      'SIPP',
      'ISA',
      'Workplace DC',
      'GIA tax-free wrapper',
    ]);
  });

  it('drops stale IDs and appends missing valid sources in config order', () => {
    const cfg = {
      ...baseConfig(),
      withdrawal_priority: ['SIPP', 'Old ISA'],
    };

    expect(normalizeWithdrawalPriority(cfg)).toEqual([
      'SIPP',
      'Workplace DC',
      'ISA',
      'GIA tax-free wrapper',
    ]);
  });

  it('drops duplicate entries and keeps the first valid occurrence', () => {
    const cfg = {
      ...baseConfig(),
      withdrawal_priority: ['ISA', 'SIPP', 'ISA', 'SIPP'],
    };

    expect(normalizeWithdrawalPriority(cfg)).toEqual([
      'ISA',
      'SIPP',
      'Workplace DC',
      'GIA tax-free wrapper',
    ]);
  });

  it('drops non-string and invalid source names', () => {
    const cfg = {
      ...baseConfig(),
      withdrawal_priority: ['Missing', 123, 'SIPP', null, '', 'ISA'],
    };

    expect(normalizeWithdrawalPriority(cfg)).toEqual([
      'SIPP',
      'ISA',
      'Workplace DC',
      'GIA tax-free wrapper',
    ]);
  });

  it('repairs empty or non-array priority values to config source order', () => {
    const emptyPriority = { ...baseConfig(), withdrawal_priority: [] };
    const nonArrayPriority = { ...baseConfig(), withdrawal_priority: 'SIPP' };

    expect(normalizeWithdrawalPriority(emptyPriority)).toEqual([
      'Workplace DC',
      'SIPP',
      'ISA',
      'GIA tax-free wrapper',
    ]);
    expect(normalizeWithdrawalPriority(nonArrayPriority)).toEqual([
      'Workplace DC',
      'SIPP',
      'ISA',
      'GIA tax-free wrapper',
    ]);
  });

  it('keeps UI-renamed display-name IDs when the priority was updated with the rename', () => {
    const cfg = {
      ...baseConfig(),
      dc_pots: [
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Renamed DC' },
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'SIPP' },
      ],
      withdrawal_priority: ['Renamed DC', 'ISA', 'SIPP', 'GIA tax-free wrapper'],
    };

    expect(normalizeWithdrawalPriority(cfg)).toEqual([
      'Renamed DC',
      'ISA',
      'SIPP',
      'GIA tax-free wrapper',
    ]);
  });

  it('repairs stale pre-rename display-name IDs without keeping the old name', () => {
    const cfg = {
      ...baseConfig(),
      dc_pots: [
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Renamed DC' },
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'SIPP' },
      ],
      withdrawal_priority: ['Old DC', 'ISA', 'SIPP'],
    };

    expect(normalizeWithdrawalPriority(cfg)).toEqual([
      'ISA',
      'SIPP',
      'Renamed DC',
      'GIA tax-free wrapper',
    ]);
  });

  it('uses normalized source order for projections when stale priority would otherwise skip withdrawals', () => {
    const cfg = {
      ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      personal: {
        ...DEFAULT_CONFIG.personal,
        date_of_birth: '1960-01',
        retirement_date: '2025-01',
        end_age: 66,
      },
      target_income: { net_annual: 20_000, cpi_rate: 0 },
      guaranteed_income: [],
      dc_pots: [
        {
          ...DEFAULT_CONFIG.dc_pots[0]!,
          name: 'Renamed DC',
          starting_balance: 50_000,
          growth_rate: 0,
          annual_fees: 0,
        },
      ],
      tax_free_accounts: [],
      withdrawal_priority: ['Old DC'],
      tax: { ...DEFAULT_CONFIG.tax, personal_allowance: 99_999, bands: [] },
    } as PlannerConfig;

    const result = runProjection(cfg);

    expect(result.years[0]!.dc_withdrawal_gross).toBeGreaterThan(19_999);
    expect(result.years[0]!.pot_pnl['Renamed DC']!.withdrawal).toBeGreaterThan(19_999);
  });
});
