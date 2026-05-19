import type { PlannerConfig } from '../../engine/types';

export interface BaselinePlanChangeSummary {
  changed: boolean;
  changedLabels: string[];
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function strategiesEqual(baseline: PlannerConfig, current: PlannerConfig): boolean {
  return (baseline.drawdown_strategy ?? 'fixed_target') === (current.drawdown_strategy ?? 'fixed_target');
}

export function detectBaselinePlanChanges(
  baseline: PlannerConfig,
  current: PlannerConfig,
): BaselinePlanChangeSummary {
  const changedLabels: string[] = [];

  if (!strategiesEqual(baseline, current)) {
    changedLabels.push('drawdown strategy');
  }

  if (stable(baseline.drawdown_strategy_params) !== stable(current.drawdown_strategy_params)) {
    changedLabels.push('strategy parameters');
  }

  if (stable(baseline.target_income) !== stable(current.target_income)) {
    changedLabels.push('target income');
  }

  if (stable(baseline.withdrawal_priority) !== stable(current.withdrawal_priority)) {
    changedLabels.push('withdrawal order');
  }

  if (stable(baseline.drawdown_stages) !== stable(current.drawdown_stages)) {
    changedLabels.push('drawdown stages');
  }

  if (stable(baseline.pension_access_events) !== stable(current.pension_access_events)) {
    changedLabels.push('planned pension access/TFC');
  }

  return {
    changed: changedLabels.length > 0,
    changedLabels,
  };
}
