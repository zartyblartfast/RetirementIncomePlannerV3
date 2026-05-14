import { STRATEGIES } from '../../engine/strategies';

export interface DashboardHeaderLabels {
  isPortfolioDriven: boolean;
  incomeLabel: string;
  cpiLabel: string;
}

export function dashboardHeaderLabelsForStrategy(strategyId: string): DashboardHeaderLabels {
  const isPortfolioDriven = !!STRATEGIES[strategyId]?.portfolio_driven;

  if (isPortfolioDriven) {
    return {
      isPortfolioDriven,
      incomeLabel: 'Planning benchmark',
      cpiLabel: 'Benchmark CPI',
    };
  }

  return {
    isPortfolioDriven,
    incomeLabel: 'Target',
    cpiLabel: 'CPI',
  };
}
