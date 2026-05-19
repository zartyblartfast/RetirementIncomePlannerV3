import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../configStore';
import type { PlannerConfig } from '../../engine/types';
import { loadScenarios, saveScenario } from '../scenarioStore';

function cloneConfig(config: PlannerConfig = DEFAULT_CONFIG): PlannerConfig {
  return JSON.parse(JSON.stringify(config)) as PlannerConfig;
}

describe('scenarioStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves a full What If strategy snapshot including staged drawdown and planned TFC events', () => {
    const config = cloneConfig();
    config.drawdown_strategy = 'fixed_target';
    config.drawdown_strategy_params = { net_annual: 42000 };
    config.target_income = { ...config.target_income, net_annual: 42000 };
    config.withdrawal_priority = ['DC Pension', 'ISA'];
    config.drawdown_stages = [
      {
        id: 'opening_blend',
        name: 'Opening blend',
        sources: [
          { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.6 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.4 },
        ],
      },
    ];
    config.pension_access_events = [
      {
        id: 'sandbox_retirement_tfc',
        event_type: 'tax_free_cash',
        pot_ref: 'DC Pension',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 25000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const saved = saveScenario('Blend with TFC', config);

    expect(saved.config.drawdown_strategy).toBe('fixed_target');
    expect(saved.config.drawdown_strategy_params).toEqual({ net_annual: 42000 });
    expect(saved.config.target_income.net_annual).toBe(42000);
    expect(saved.config.withdrawal_priority).toEqual(['DC Pension', 'ISA']);
    expect(saved.config.drawdown_stages).toEqual(config.drawdown_stages);
    expect(saved.config.pension_access_events).toEqual(config.pension_access_events);

    config.drawdown_stages[0]!.sources[0]!.target_share = 1;
    config.pension_access_events[0]!.amount = { kind: 'fixed_amount', value: 1 };

    const [loaded] = loadScenarios();
    expect(loaded!.config.drawdown_stages![0]!.sources[0]!.target_share).toBe(0.6);
    expect(loaded!.config.pension_access_events![0]!.amount).toEqual({ kind: 'fixed_amount', value: 25000 });
  });
});
