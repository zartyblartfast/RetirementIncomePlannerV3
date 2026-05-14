import { describe, expect, it } from 'vitest';
import { dashboardHeaderLabelsForStrategy } from '../dashboardHeaderLabels';

describe('dashboardHeaderLabelsForStrategy', () => {
  it('keeps target wording for target-led strategies', () => {
    const labels = dashboardHeaderLabelsForStrategy('fixed_target');

    expect(labels.isPortfolioDriven).toBe(false);
    expect(labels.incomeLabel).toBe('Target');
    expect(labels.cpiLabel).toBe('CPI');
  });

  it('uses benchmark wording for portfolio-driven strategies', () => {
    const labels = dashboardHeaderLabelsForStrategy('arva');

    expect(labels.isPortfolioDriven).toBe(true);
    expect(labels.incomeLabel).toBe('Planning benchmark');
    expect(labels.cpiLabel).toBe('Benchmark CPI');
  });
});
