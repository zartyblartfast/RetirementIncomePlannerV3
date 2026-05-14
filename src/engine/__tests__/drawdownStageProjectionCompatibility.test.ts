import { describe, expect, it } from 'vitest';
import type { PlannerConfig, ProjectionResult } from '../types';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function extractComparableProjection(result: ProjectionResult) {
  return {
    summary: result.summary,
    years: result.years.map(year => ({
      age: year.age,
      tax_year: year.tax_year,
      target_net: year.target_net,
      guaranteed_total: year.guaranteed_total,
      dc_withdrawal_gross: year.dc_withdrawal_gross,
      dc_tax_free_portion: year.dc_tax_free_portion,
      tf_withdrawal: year.tf_withdrawal,
      withdrawal_detail: year.withdrawal_detail,
      total_taxable_income: year.total_taxable_income,
      tax_due: year.tax_due,
      net_income_achieved: year.net_income_achieved,
      shortfall: year.shortfall,
      pot_balances: year.pot_balances,
      tf_balances: year.tf_balances,
      total_capital: year.total_capital,
    })),
  };
}

describe('drawdown stage projection compatibility', () => {
  it('uses one-source drawdown stages as the source allocation order when present', () => {
    const legacyCfg = cloneConfig(DEFAULT_CONFIG);
    legacyCfg.withdrawal_priority = ['ISA', 'Employer DC Pot', 'Consolidated DC Pot'];
    delete legacyCfg.drawdown_stages;

    const stagedCfg = cloneConfig(DEFAULT_CONFIG);
    stagedCfg.withdrawal_priority = ['Consolidated DC Pot', 'Employer DC Pot', 'ISA'];
    stagedCfg.drawdown_stages = [
      {
        id: 'stage_isa',
        name: 'Use ISA first',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
      {
        id: 'stage_employer_dc',
        sources: [{ source_type: 'dc_pot', source_name: 'Employer DC Pot', target_share: 1 }],
      },
      {
        id: 'stage_consolidated_dc',
        sources: [{ source_type: 'dc_pot', source_name: 'Consolidated DC Pot', target_share: 1 }],
      },
    ];

    expect(extractComparableProjection(runProjection(stagedCfg))).toEqual(
      extractComparableProjection(runProjection(legacyCfg)),
    );
  });
});
