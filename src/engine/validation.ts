/**
 * Config and strategy output validation for the projection engine.
 *
 * Port of V1 config_helpers.py validate_config / validate_strategy_output.
 */

import { STRATEGY_IDS } from './strategies';
import { getTaxRulePack } from './taxRulePacks';
import type { PlannerConfig, StrategyTarget } from './types';
import { deriveRetirementAge } from './dateUtils';

const VALID_MODES = new Set(['net', 'pot_net', 'gross']);

/**
 * Check config invariants before running a projection.
 * Returns an array of error strings. Empty array means valid.
 */
export function validateConfig(cfg: PlannerConfig): string[] {
  const errors: string[] = [];

  // Strategy must be known
  const sid = cfg.drawdown_strategy;
  if (sid && !STRATEGY_IDS.includes(sid)) {
    errors.push(`Unknown drawdown_strategy: '${sid}'`);
  }

  // Strategy params must exist
  if (!cfg.drawdown_strategy_params) {
    errors.push('Missing drawdown_strategy_params');
  }

  if (cfg.tax?.rule_pack_id && !getTaxRulePack(cfg.tax.rule_pack_id)) {
    errors.push(`Unknown tax rule pack: '${cfg.tax.rule_pack_id}'`);
  }

  const endAge = cfg.personal?.end_age;
  const retAge = cfg.personal?.date_of_birth && cfg.personal?.retirement_date
    ? deriveRetirementAge(cfg.personal.date_of_birth, cfg.personal.retirement_date)
    : undefined;

  // Plan end must be > retirement age
  if (endAge != null && retAge != null && endAge <= retAge) {
    errors.push(`end_age (${endAge}) must be > derived retirement age (${retAge})`);
  }

  // Projection must cover plan
  const projEnd = (cfg as unknown as Record<string, unknown>).projection_end_age as number | undefined;
  if (projEnd != null && endAge != null && projEnd < endAge) {
    errors.push(`projection_end_age (${projEnd}) < end_age (${endAge})`);
  }

  // Pot balances must be non-negative
  for (const pot of cfg.dc_pots ?? []) {
    if ((pot.starting_balance ?? 0) < 0) {
      errors.push(`Negative DC pot balance: ${pot.name}`);
    }
  }
  for (const acc of cfg.tax_free_accounts ?? []) {
    if ((acc.starting_balance ?? 0) < 0) {
      errors.push(`Negative TF account balance: ${acc.name}`);
    }
  }

  // target_end_age must NOT exist in strategy params (removed — engine
  // derives planEndAge from personal.end_age)
  const params = cfg.drawdown_strategy_params as Record<string, unknown> | undefined;
  if (params && 'target_end_age' in params) {
    errors.push(
      'target_end_age found in drawdown_strategy_params — ' +
      'this param has been removed; engine uses personal.end_age',
    );
  }

  return errors;
}

/**
 * Validate a single strategy compute result.
 * Called after each annual strategy dispatch.
 * Returns an array of error strings. Empty = valid.
 */
export function validateStrategyOutput(
  result: StrategyTarget,
  strategyId: string,
): string[] {
  const errors: string[] = [];

  if (!result || typeof result !== 'object') {
    errors.push(`Strategy ${strategyId} returned non-object: ${typeof result}`);
    return errors;
  }

  if (!VALID_MODES.has(result.mode)) {
    errors.push(`Strategy ${strategyId} returned invalid mode: '${result.mode}'`);
  }

  if (result.annual_amount == null) {
    errors.push(`Strategy ${strategyId} returned no annual_amount`);
  } else if (result.annual_amount < 0) {
    errors.push(`Strategy ${strategyId} returned negative annual_amount: ${result.annual_amount}`);
  }

  return errors;
}

/**
 * Create a config for an extended (chart) projection.
 *
 * Sets `projection_end_age` so the engine simulates further than the
 * user's plan end age. `personal.end_age` and all strategy params
 * are left untouched.
 */
export function makeExtendedConfig(cfg: PlannerConfig, horizon = 120): PlannerConfig {
  const ext: PlannerConfig = JSON.parse(JSON.stringify(cfg));
  const planEnd = ext.personal.end_age;
  (ext as unknown as Record<string, unknown>).projection_end_age = Math.min(horizon, Math.max(planEnd, horizon));
  return ext;
}
