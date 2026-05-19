import type { PlannerConfig } from '../../engine/types';

function deepClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Copy only forward-looking strategy / TFC settings from a What If sandbox into
 * the live Current Plan. Review history, balances, income sources, tax settings,
 * and other plan identity fields remain owned by the current plan / Review flow.
 */
export function applySandboxStrategySettingsToCurrentPlan(
  currentPlan: PlannerConfig,
  sandbox: PlannerConfig,
): PlannerConfig {
  const next = deepClone(currentPlan);

  next.drawdown_strategy = sandbox.drawdown_strategy;
  next.drawdown_strategy_params = deepClone(sandbox.drawdown_strategy_params);
  next.target_income = deepClone(sandbox.target_income);
  next.withdrawal_priority = deepClone(sandbox.withdrawal_priority);
  next.drawdown_stages = sandbox.drawdown_stages === undefined
    ? undefined
    : deepClone(sandbox.drawdown_stages);

  if (sandbox.pension_access_events === undefined) {
    delete next.pension_access_events;
  } else {
    next.pension_access_events = deepClone(sandbox.pension_access_events);
  }

  return next;
}
