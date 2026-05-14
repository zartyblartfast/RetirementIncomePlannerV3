import { describe, expect, it } from 'vitest';
import { stressChartLabelsForStrategy } from '../stressChartLabels';

describe('stressChartLabelsForStrategy', () => {
  it('keeps target-income wording for target-led strategies', () => {
    const labels = stressChartLabelsForStrategy('fixed_target');

    expect(labels.isPortfolioDriven).toBe(false);
    expect(labels.incomeChartTitle).toBe('Net Income — Historical Percentile Bands');
    expect(labels.benchmarkTooltipLabel).toBe('Target');
    expect(labels.benchmarkLineName).toBe('Target income');
    expect(labels.benchmarkLegendText).toBe('Inflation-indexed target net income');
    expect(labels.timelineBenchmarkHeading).toBe('Target');
    expect(labels.timelineRatioHeading).toBe('% of Target');
  });

  it('uses generated-income and benchmark wording for portfolio-driven strategies', () => {
    const labels = stressChartLabelsForStrategy('arva');

    expect(labels.isPortfolioDriven).toBe(true);
    expect(labels.incomeChartTitle).toBe('Net Income Generated — Historical Percentile Bands');
    expect(labels.benchmarkTooltipLabel).toBe('Planning benchmark');
    expect(labels.benchmarkLineName).toBe('Planning benchmark');
    expect(labels.benchmarkLegendText).toBe('Planning benchmark — shown for comparison only');
    expect(labels.timelineBenchmarkHeading).toBe('Planning benchmark');
    expect(labels.timelineRatioHeading).toBe('% of benchmark');
  });
});
