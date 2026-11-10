import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../store/configStore';
import { incomeBasisForConfig } from '../incomeBasis';

describe('incomeBasisForConfig', () => {
  it('uses the active fixed target instead of a stale planning reference', () => {
    expect(incomeBasisForConfig({
      ...DEFAULT_CONFIG,
      drawdown_strategy: 'fixed_target',
      drawdown_strategy_params: { net_annual: 30000 },
      target_income: { ...DEFAULT_CONFIG.target_income, net_annual: 32000 },
    })).toEqual({ label: 'Target', amount: 30000 });
  });

  it('uses the initial target for dynamic rules and benchmark for portfolio-driven rules', () => {
    const config = {
      ...DEFAULT_CONFIG,
      target_income: { ...DEFAULT_CONFIG.target_income, net_annual: 32000 },
      drawdown_strategy_params: { initial_target: 34000 },
    };
    expect(incomeBasisForConfig({ ...config, drawdown_strategy: 'vanguard_dynamic' }))
      .toEqual({ label: 'Initial target', amount: 34000 });
    expect(incomeBasisForConfig({ ...config, drawdown_strategy: 'arva' }))
      .toEqual({ label: 'Planning benchmark', amount: 32000 });
  });
});
