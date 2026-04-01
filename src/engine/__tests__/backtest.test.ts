import { describe, it, expect } from 'vitest';
import { runBacktest, extractStressTest } from '../backtest';
import { DEFAULT_CONFIG } from './fixtures';
import type { PlannerConfig } from '../types';

describe('Backtest — small window run', () => {
  // Use maxWindows=3 for speed
  const bt = runBacktest(DEFAULT_CONFIG, 3);

  it('produces 3 windows', () => {
    expect(bt.windows.length).toBe(3);
  });

  it('metadata has correct n_years', () => {
    // end_age 90 - retirement_age 68 = 22
    expect(bt.metadata.n_years).toBe(22);
    expect(bt.metadata.retirement_age).toBe(68);
    expect(bt.metadata.end_age).toBe(90);
  });

  it('each window has a projection result', () => {
    for (const w of bt.windows) {
      expect(w.result.years.length).toBeGreaterThan(0);
      expect(w.result.summary).toBeDefined();
      expect(w.window_label).toMatch(/^\d{4}-\d{4}$/);
    }
  });

  it('window labels are sequential', () => {
    const starts = bt.windows.map(w => w.window_start);
    expect(starts[1]! - starts[0]!).toBe(1);
    expect(starts[2]! - starts[1]!).toBe(1);
  });

  it('windows use different growth rates (not all identical)', () => {
    const capitals = bt.windows.map(w => w.result.summary.remaining_capital);
    // With different historical periods, remaining capital should differ
    const allSame = capitals.every(c => c === capitals[0]);
    expect(allSame).toBe(false);
  });
});

describe('Backtest — stress test extraction', () => {
  const bt = runBacktest(DEFAULT_CONFIG, 5);
  const stress = extractStressTest(bt);

  it('returns a result', () => {
    expect(stress).not.toBeNull();
  });

  it('has ages array from 68 to 90', () => {
    expect(stress!.ages[0]).toBe(68);
    expect(stress!.ages[stress!.ages.length - 1]).toBe(90);
    expect(stress!.ages.length).toBe(23);
  });

  it('has percentile trajectories', () => {
    expect(stress!.percentile_trajectories).toHaveProperty('p5');
    expect(stress!.percentile_trajectories).toHaveProperty('p50');
    expect(stress!.percentile_trajectories).toHaveProperty('p90');
    // Each trajectory has an entry per age
    expect(stress!.percentile_trajectories.p50!.length).toBe(23);
  });

  it('p90 capital >= p50 >= p10 at end age', () => {
    const lastIdx = stress!.ages.length - 1;
    const p10 = stress!.percentile_trajectories.p10![lastIdx]!.total_capital;
    const p50 = stress!.percentile_trajectories.p50![lastIdx]!.total_capital;
    const p90 = stress!.percentile_trajectories.p90![lastIdx]!.total_capital;
    expect(p90).toBeGreaterThanOrEqual(p50);
    expect(p50).toBeGreaterThanOrEqual(p10);
  });

  it('sustainability rate is between 0 and 1', () => {
    expect(stress!.sustainability.rate).toBeGreaterThanOrEqual(0);
    expect(stress!.sustainability.rate).toBeLessThanOrEqual(1);
    expect(stress!.sustainability.total).toBe(5);
  });

  it('income stability has valid ratios', () => {
    expect(stress!.income_stability.median_income_ratio).toBeGreaterThan(0);
    expect(stress!.income_stability.worst_income_ratio).toBeLessThanOrEqual(
      stress!.income_stability.best_income_ratio
    );
  });

  it('cumulative income: worst <= median <= best', () => {
    expect(stress!.cumulative_income.worst).toBeLessThanOrEqual(stress!.cumulative_income.median);
    expect(stress!.cumulative_income.median).toBeLessThanOrEqual(stress!.cumulative_income.best);
  });

  it('worst/median/best windows have timelines', () => {
    expect(stress!.worst_window.timeline.length).toBeGreaterThan(0);
    expect(stress!.median_window.timeline.length).toBeGreaterThan(0);
    expect(stress!.best_window.timeline.length).toBeGreaterThan(0);
  });

  it('worst window timeline entries have expected fields', () => {
    const entry = stress!.worst_window.timeline[0]!;
    expect(entry).toHaveProperty('age');
    expect(entry).toHaveProperty('calendar_year');
    expect(entry).toHaveProperty('market_return');
    expect(entry).toHaveProperty('total_capital');
    expect(entry).toHaveProperty('net_income');
    expect(entry).toHaveProperty('income_ratio');
    expect(entry).toHaveProperty('shortfall');
  });

  it('worst window has trajectory array', () => {
    expect(stress!.worst_window.trajectory).toBeDefined();
    expect(stress!.worst_window.trajectory!.length).toBe(23);
  });

  it('n_windows matches', () => {
    expect(stress!.n_windows).toBe(5);
  });
});

describe('Backtest — empty result handling', () => {
  it('extractStressTest returns null for empty windows', () => {
    const result = extractStressTest({
      windows: [],
      metadata: {
        n_windows: 0, n_years: 22,
        start_range: null, end_range: null,
        retirement_age: 68, end_age: 90,
      },
    });
    expect(result).toBeNull();
  });
});

describe('Backtest — different strategy', () => {
  const cfg: PlannerConfig = {
    ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    drawdown_strategy: 'fixed_percentage',
    drawdown_strategy_params: { withdrawal_rate: 4.0 },
  };
  const bt = runBacktest(cfg, 3);

  it('runs with fixed_percentage strategy', () => {
    expect(bt.windows.length).toBe(3);
    for (const w of bt.windows) {
      expect(w.result.years.length).toBeGreaterThan(0);
    }
  });
});
