import type { PlannerConfig } from '../../engine/types';
import { dashboardHeaderLabelsForStrategy } from './dashboardHeaderLabels';

/** The active income reference shown with a projection, not necessarily the stored benchmark. */
export function incomeBasisForConfig(config: PlannerConfig): { label: string; amount: number } {
  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const params = config.drawdown_strategy_params;
  if (strategyId === 'fixed_target') {
    return { label: 'Target', amount: params?.net_annual ?? config.target_income.net_annual };
  }
  if (strategyId === 'vanguard_dynamic' || strategyId === 'guyton_klinger') {
    return { label: 'Initial target', amount: params?.initial_target ?? config.target_income.net_annual };
  }
  return {
    label: dashboardHeaderLabelsForStrategy(strategyId).incomeLabel,
    amount: config.target_income.net_annual,
  };
}
