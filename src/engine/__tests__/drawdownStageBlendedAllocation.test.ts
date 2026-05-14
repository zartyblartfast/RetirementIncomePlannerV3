import { describe, expect, it } from 'vitest';
import type { PlannerConfig } from '../types';
import { runProjection } from '../projection';

function makeBlendedConfig(): PlannerConfig {
  return {
    personal: {
      date_of_birth: '1960-01',
      retirement_date: '2025-01',
      end_age: 66,
      currency: 'GBP',
    },
    target_income: {
      net_annual: 12000,
      cpi_rate: 0,
    },
    guaranteed_income: [],
    dc_pots: [
      {
        name: 'Main DC',
        starting_balance: 50000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      },
    ],
    tax_free_accounts: [
      {
        name: 'ISA',
        starting_balance: 50000,
        growth_rate: 0,
        values_as_of: '2025-01',
      },
    ],
    withdrawal_priority: ['Main DC', 'ISA'],
    drawdown_stages: [
      {
        id: 'stage_blend',
        name: 'Blend DC and ISA',
        sources: [
          { source_type: 'dc_pot', source_name: 'Main DC', target_share: 0.5 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.5 },
        ],
      },
    ],
    tax: {
      regime: 'Test no tax',
      personal_allowance: 1000000,
      bands: [{ name: 'Nil', width: null, rate: 0 }],
      tax_cap_enabled: false,
      tax_cap_amount: 200000,
    },
  };
}

function makePortfolioDrivenBlendedConfig(): PlannerConfig {
  const cfg = makeBlendedConfig();
  cfg.target_income.net_annual = 50000;
  cfg.drawdown_strategy = 'fixed_percentage';
  cfg.drawdown_strategy_params = { withdrawal_rate: 12 };
  return cfg;
}

describe('blended drawdown stage allocation', () => {
  it('funds a target-led withdrawal from a blended stage according to gross target shares', () => {
    const result = runProjection(makeBlendedConfig());
    const year = result.years[0]!;

    expect(year.dc_withdrawal_gross).toBe(6000);
    expect(year.tf_withdrawal).toBe(6000);
    expect(year.net_income_achieved).toBeCloseTo(12000, 0);
    expect(year.withdrawal_detail).toEqual({
      'Main DC': 6000,
      ISA: 6000,
    });
    expect(year.pot_balances['Main DC']).toBe(44000);
    expect(year.tf_balances.ISA).toBe(44000);
  });

  it('redistributes an unfunded blended share across remaining sources in the same stage', () => {
    const cfg = makeBlendedConfig();
    cfg.tax_free_accounts[0]!.starting_balance = 1000;

    const result = runProjection(cfg);
    const year = result.years[0]!;

    expect(year.dc_withdrawal_gross).toBe(11000);
    expect(year.tf_withdrawal).toBe(1000);
    expect(year.net_income_achieved).toBeCloseTo(12000, 0);
    expect(year.withdrawal_detail).toEqual({
      'Main DC': 11000,
      ISA: 1000,
    });
    expect(year.pot_balances['Main DC']).toBe(39000);
    expect(year.tf_balances.ISA).toBe(0);
    expect(year.drawdown_stage_allocations).toEqual([
      {
        stage_id: 'stage_blend',
        stage_name: 'Blend DC and ISA',
        source_type: 'dc_pot',
        source_name: 'Main DC',
        target_share: 0.5,
        actual_gross_withdrawal: 11000,
        actual_net_income: 11000,
        tax_free_amount: 2750,
        taxable_amount: 8250,
      },
      {
        stage_id: 'stage_blend',
        stage_name: 'Blend DC and ISA',
        source_type: 'tax_free_account',
        source_name: 'ISA',
        target_share: 0.5,
        actual_gross_withdrawal: 1000,
        actual_net_income: 1000,
        tax_free_amount: 1000,
        taxable_amount: 0,
      },
    ]);
  });

  it('allocates portfolio-driven gross withdrawals across blended stages without grossing up to the planning benchmark', () => {
    const result = runProjection(makePortfolioDrivenBlendedConfig());
    const year = result.years[0]!;

    expect(year.target_net).toBe(12000);
    expect(year.dc_withdrawal_gross).toBe(6000);
    expect(year.tf_withdrawal).toBe(6000);
    expect(year.net_income_achieved).toBeCloseTo(12000, 0);
    expect(year.withdrawal_detail).toEqual({
      'Main DC': 6000,
      ISA: 6000,
    });
    expect(year.pot_balances['Main DC']).toBe(44000);
    expect(year.tf_balances.ISA).toBe(44000);
  });

  it('redistributes an unfunded portfolio-driven gross share across remaining sources in the same stage', () => {
    const cfg = makePortfolioDrivenBlendedConfig();
    cfg.tax_free_accounts[0]!.starting_balance = 1000;

    const result = runProjection(cfg);
    const year = result.years[0]!;

    expect(year.target_net).toBe(6120);
    expect(year.dc_withdrawal_gross).toBe(5120);
    expect(year.tf_withdrawal).toBe(1000);
    expect(year.net_income_achieved).toBeCloseTo(6120, 0);
    expect(year.withdrawal_detail).toEqual({
      'Main DC': 5120,
      ISA: 1000,
    });
  });

  it('records a monthly transition when a blended stage is depleted and allocation moves to the next stage', () => {
    const cfg = makeBlendedConfig();
    cfg.dc_pots = [
      {
        name: 'Bridge DC',
        starting_balance: 1000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      },
      {
        name: 'Main DC',
        starting_balance: 50000,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 0.25,
        values_as_of: '2025-01',
      },
    ];
    cfg.tax_free_accounts[0]!.starting_balance = 1000;
    cfg.drawdown_stages = [
      {
        id: 'stage_bridge_blend',
        name: 'Bridge blend',
        sources: [
          { source_type: 'dc_pot', source_name: 'Bridge DC', target_share: 0.5 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.5 },
        ],
      },
      {
        id: 'stage_main_dc',
        name: 'Main DC fallback',
        sources: [{ source_type: 'dc_pot', source_name: 'Main DC', target_share: 1 }],
      },
    ];

    const result = runProjection(cfg);
    const year = result.years[0]!;

    expect(year.net_income_achieved).toBeCloseTo(12000, 0);
    expect(year.withdrawal_detail).toEqual({
      'Bridge DC': 1000,
      ISA: 1000,
      'Main DC': 10000,
    });
    expect(year.drawdown_stage_transitions).toEqual([
      {
        month: 2,
        from_stage_id: 'stage_bridge_blend',
        from_stage_name: 'Bridge blend',
        to_stage_id: 'stage_main_dc',
        to_stage_name: 'Main DC fallback',
        reason: 'stage_depleted',
      },
    ]);
  });
});
