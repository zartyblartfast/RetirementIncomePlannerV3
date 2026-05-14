import { STRATEGIES } from '../../engine/strategies';

export interface StressChartLabels {
  isPortfolioDriven: boolean;
  incomeChartTitle: string;
  benchmarkTooltipLabel: string;
  benchmarkLineName: string;
  benchmarkLegendText: string;
  timelineBenchmarkHeading: string;
  timelineRatioHeading: string;
}

export function stressChartLabelsForStrategy(strategyId: string): StressChartLabels {
  const isPortfolioDriven = !!STRATEGIES[strategyId]?.portfolio_driven;

  if (isPortfolioDriven) {
    return {
      isPortfolioDriven,
      incomeChartTitle: 'Net Income Generated — Historical Percentile Bands',
      benchmarkTooltipLabel: 'Planning benchmark',
      benchmarkLineName: 'Planning benchmark',
      benchmarkLegendText: 'Planning benchmark — shown for comparison only',
      timelineBenchmarkHeading: 'Planning benchmark',
      timelineRatioHeading: '% of benchmark',
    };
  }

  return {
    isPortfolioDriven,
    incomeChartTitle: 'Net Income — Historical Percentile Bands',
    benchmarkTooltipLabel: 'Target',
    benchmarkLineName: 'Target income',
    benchmarkLegendText: 'Inflation-indexed target net income',
    timelineBenchmarkHeading: 'Target',
    timelineRatioHeading: '% of Target',
  };
}
