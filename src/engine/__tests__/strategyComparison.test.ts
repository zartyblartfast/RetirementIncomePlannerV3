import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../store/configStore';
import { runProjection } from '../projection';
import { evaluateStrategyComparisonCandidate, generateStrategyComparisonCandidates } from '../strategyComparison';
import type { PlannerConfig } from '../types';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function worstYearOnYearDrop(values: number[]): number {
  let worstDrop = 0;
  for (let i = 1; i < values.length; i += 1) {
    const drop = values[i - 1]! - values[i]!;
    if (drop > worstDrop) worstDrop = drop;
  }
  return worstDrop;
}

function makeTwoDcPlusIsaConfig(): PlannerConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.dc_pots = [
    { ...cfg.dc_pots[0]!, name: 'Main DC', starting_balance: 120000 },
    { ...cfg.dc_pots[0]!, name: 'Second DC', starting_balance: 80000 },
  ];
  cfg.tax_free_accounts = [
    { ...cfg.tax_free_accounts[0]!, name: 'ISA', starting_balance: 40000 },
  ];
  cfg.withdrawal_priority = ['Main DC', 'Second DC', 'ISA'];
  cfg.drawdown_stages = [
    {
      id: 'current_blend',
      name: 'Opening blend',
      sources: [
        { source_type: 'dc_pot', source_name: 'Main DC', target_share: 0.6 },
        { source_type: 'dc_pot', source_name: 'Second DC', target_share: 0.4 },
      ],
    },
    {
      id: 'isa_later',
      sources: [
        { source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 },
      ],
    },
  ];
  cfg.pension_access_events = [
    {
      id: 'planned_tfc',
      pot_ref: 'Main DC',
      event_type: 'tax_free_cash',
      timing: { kind: 'retirement_date' },
      amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
      destination: { kind: 'outside_plan' },
    },
  ];
  return cfg;
}

describe('strategy comparison candidates', () => {
  it('includes the current user-authored strategy without mutating the input config', () => {
    const cfg = makeTwoDcPlusIsaConfig();
    const before = cloneConfig(cfg);

    const candidates = generateStrategyComparisonCandidates(cfg);

    expect(cfg).toEqual(before);
    expect(candidates[0]).toEqual(expect.objectContaining({
      id: 'current_strategy',
      label: 'Current strategy',
      already_active: true,
      source_rule_summary: 'Opening blend — Main DC 60.0% + Second DC 40.0%; Stage 2 — ISA 100.0%',
    }));
    expect(candidates[0]!.config.drawdown_stages).toEqual(cfg.drawdown_stages);
    expect(candidates[0]!.config.pension_access_events).toEqual(cfg.pension_access_events);
  });

  it('generates sequential alternatives with matching drawdown stages and withdrawal priority', () => {
    const cfg = makeTwoDcPlusIsaConfig();

    const candidates = generateStrategyComparisonCandidates(cfg);
    const sequential = candidates.find(candidate => candidate.id === 'sequential_Main_DC_Second_DC_ISA');

    expect(sequential).toEqual(expect.objectContaining({
      label: 'Sequential: Main DC then Second DC then ISA',
      already_active: false,
      source_rule_summary: 'Stage 1 — Main DC 100.0%; Stage 2 — Second DC 100.0%; Stage 3 — ISA 100.0%',
    }));
    expect(sequential!.config.withdrawal_priority).toEqual(['Main DC', 'Second DC', 'ISA']);
    expect(sequential!.config.drawdown_stages).toEqual([
      { id: 'strategy_seq_1', sources: [{ source_type: 'dc_pot', source_name: 'Main DC', target_share: 1 }] },
      { id: 'strategy_seq_2', sources: [{ source_type: 'dc_pot', source_name: 'Second DC', target_share: 1 }] },
      { id: 'strategy_seq_3', sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }] },
    ]);
  });

  it('generates simple blended alternatives for DC-first and ISA-first patterns', () => {
    const cfg = makeTwoDcPlusIsaConfig();

    const candidates = generateStrategyComparisonCandidates(cfg);
    const dcBlendFirst = candidates.find(candidate => candidate.id === 'blend_dc_first_then_tax_free');
    const isaFirst = candidates.find(candidate => candidate.id === 'tax_free_first_then_blend_dc');
    const equalBlendAll = candidates.find(candidate => candidate.id === 'equal_blend_all_sources');

    expect(dcBlendFirst?.source_rule_summary).toBe('Blend DC pensions first — Main DC 50.0% + Second DC 50.0%; Stage 2 — ISA 100.0%');
    expect(dcBlendFirst?.config.withdrawal_priority).toEqual(['Main DC', 'Second DC', 'ISA']);
    expect(isaFirst?.source_rule_summary).toBe('Tax-free accounts first — ISA 100.0%; Stage 2 — Main DC 50.0% + Second DC 50.0%');
    expect(isaFirst?.config.withdrawal_priority).toEqual(['ISA', 'Main DC', 'Second DC']);
    expect(equalBlendAll?.source_rule_summary).toBe('Equal blend all flexible sources — Main DC 33.3% + Second DC 33.3% + ISA 33.3%');
    expect(equalBlendAll?.config.drawdown_stages?.[0]?.sources).toHaveLength(3);
  });

  it('evaluates a candidate with metrics that reconcile to direct projection output', () => {
    const cfg = makeTwoDcPlusIsaConfig();
    cfg.personal.end_age = 70;
    const candidate = generateStrategyComparisonCandidates(cfg)
      .find(item => item.id === 'blend_dc_first_then_tax_free')!;

    const evaluated = evaluateStrategyComparisonCandidate(candidate);
    const direct = runProjection(candidate.config);
    const annualNetIncome = direct.years.map(year => year.net_income_achieved);
    const referenceGaps = direct.years.map(year => Math.max(0, year.target_net - year.net_income_achieved));

    expect(evaluated).toEqual(expect.objectContaining({
      id: candidate.id,
      label: candidate.label,
      source_rule_summary: candidate.source_rule_summary,
      already_active: false,
      sustainable: direct.summary.sustainable,
      first_shortfall_age: direct.summary.first_shortfall_age,
      remaining_capital: Math.round(direct.summary.remaining_capital),
      final_flexible_capital: Math.round(direct.summary.remaining_capital),
      total_tax: Math.round(direct.summary.total_tax_paid),
      average_annual_net_income: Math.round(average(annualNetIncome)),
      minimum_annual_net_income: Math.round(Math.min(...annualNetIncome)),
      years_below_reference_income: direct.years.filter(year => year.net_income_achieved < year.target_net - 1).length,
      total_gap_vs_reference_income: Math.round(referenceGaps.reduce((sum, gap) => sum + gap, 0)),
      worst_annual_gap_vs_reference_income: Math.round(Math.max(...referenceGaps)),
      income_volatility: Math.round(standardDeviation(annualNetIncome)),
      worst_annual_income_drop: Math.round(worstYearOnYearDrop(annualNetIncome)),
      first_depleted_source: direct.summary.depletion_events[0]?.pot ?? null,
      first_depleted_age: direct.summary.depletion_events[0]?.age ?? null,
      income_shortfall_years: direct.years.filter(year => year.shortfall).length,
    }));
  });

  it('uses the planning benchmark as reference income for portfolio-driven strategies', () => {
    const cfg = makeTwoDcPlusIsaConfig();
    cfg.drawdown_strategy = 'arva';
    cfg.drawdown_strategy_params = { assumed_real_return_pct: 3 };
    cfg.target_income = { ...cfg.target_income, net_annual: 50000, cpi_rate: 0.02 };
    cfg.personal.end_age = 68;
    const candidate = generateStrategyComparisonCandidates(cfg)[0]!;

    const evaluated = evaluateStrategyComparisonCandidate(candidate);
    const direct = runProjection(candidate.config);
    const expectedReferenceGaps = direct.years.map((year, index) => {
      const reference = cfg.target_income.net_annual * ((1 + cfg.target_income.cpi_rate) ** index);
      return Math.max(0, reference - year.net_income_achieved);
    });

    expect(evaluated.years_below_reference_income).toBe(
      direct.years.filter((year, index) => {
        const reference = cfg.target_income.net_annual * ((1 + cfg.target_income.cpi_rate) ** index);
        return year.net_income_achieved < reference - 1;
      }).length,
    );
    expect(evaluated.total_gap_vs_reference_income).toBe(
      Math.round(expectedReferenceGaps.reduce((sum, gap) => sum + gap, 0)),
    );
    expect(evaluated.worst_annual_gap_vs_reference_income).toBe(Math.round(Math.max(...expectedReferenceGaps)));
  });
});
