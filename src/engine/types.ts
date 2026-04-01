/**
 * Retirement Income Planner V2 — Engine Type Definitions
 *
 * Mirrors the V1 Python config schema and engine output structures.
 */

// ------------------------------------------------------------------ //
//  Config types
// ------------------------------------------------------------------ //

export interface PersonalConfig {
  date_of_birth: string;        // "YYYY-MM"
  retirement_date: string;      // "YYYY-MM"
  retirement_age?: number;      // informational only — derived from dates
  end_age: number;
  currency: string;
}

export interface TargetIncomeConfig {
  net_annual: number;
  cpi_rate: number;
}

export interface GuaranteedIncomeConfig {
  name: string;
  gross_annual: number;
  indexation_rate: number;
  start_date?: string;          // "YYYY-MM" — source of truth
  end_date?: string | null;     // "YYYY-MM" or null (lifetime)
  start_age?: number;           // legacy, auto-migrated
  end_age?: number | null;      // legacy, auto-migrated
  taxable: boolean;
  values_as_of?: string;        // "YYYY-MM"
}

export interface HoldingConfig {
  fund_name: string;
  input_type: string;
  input_value: string;
  benchmark_key: string;
  weight: number;
}

export interface AllocationConfig {
  mode: string;
  template_id?: string;
  custom_weights?: Record<string, number>;
  manual_override?: boolean;
}

export interface DCPotConfig {
  name: string;
  starting_balance: number;
  growth_rate: number;
  annual_fees: number;
  tax_free_portion: number;
  allocation?: AllocationConfig;
  values_as_of?: string;
  holdings?: HoldingConfig[];
}

export interface TaxFreeAccountConfig {
  name: string;
  starting_balance: number;
  growth_rate: number;
  allocation?: AllocationConfig;
  values_as_of?: string;
  holdings?: HoldingConfig[];
}

export interface TaxBandConfig {
  name: string;
  width: number | null;
  rate: number;
}

export interface TaxConfig {
  regime: string;
  personal_allowance: number;
  bands: TaxBandConfig[];
  tax_cap_enabled?: boolean;
  tax_cap_amount?: number;
}

export interface PlannerConfig {
  personal: PersonalConfig;
  target_income: TargetIncomeConfig;
  guaranteed_income: GuaranteedIncomeConfig[];
  dc_pots: DCPotConfig[];
  tax_free_accounts: TaxFreeAccountConfig[];
  withdrawal_priority: string[];
  tax: TaxConfig;
  drawdown_strategy?: string;
  drawdown_strategy_params?: Record<string, number>;
  // Backtest schedule overrides (internal)
  cpi_rate_schedule?: Record<number, number>;
  _dc_growth_schedules?: Record<string, Record<number, number>>;
  _tf_growth_schedules?: Record<string, Record<number, number>>;
}

// ------------------------------------------------------------------ //
//  Tax result types
// ------------------------------------------------------------------ //

export interface TaxBandDetail {
  name: string;
  rate: number;
  width: number | 'remainder';
  taxable_in_band: number;
  tax: number;
}

export interface TaxResult {
  total: number;
  taxable_income: number;
  personal_allowance: number;
  income_after_pa: number;
  bands: TaxBandDetail[];
  marginal_rate: number;
  tax_cap_applied: boolean;
}

// ------------------------------------------------------------------ //
//  Strategy types
// ------------------------------------------------------------------ //

export type StrategyMode = 'net' | 'gross' | 'pot_net';

export interface StrategyTarget {
  mode: StrategyMode;
  annual_amount: number;
}

export type StrategyState = Record<string, unknown> | null;

export interface StrategyDefinition {
  display_name: string;
  description: string;
  params: StrategyParamDef[];
}

export interface StrategyParamDef {
  key: string;
  label: string;
  type: string;
  step: number;
  default: number;
  tooltip?: string;
  sandbox_hidden?: boolean;
}

// ------------------------------------------------------------------ //
//  Engine output types
// ------------------------------------------------------------------ //

export interface GrowthProvenance {
  source: string;
  detail: string;
  rate: number;
}

export interface PotPnl {
  opening: number;
  growth: number;
  fees: number;
  withdrawal: number;
  closing: number;
  provenance: GrowthProvenance;
}

export interface DepletionEvent {
  pot: string;
  age: number;
  month: number;
}

export interface YearRow {
  age: number;
  tax_year: string;
  target_net: number;
  guaranteed_income: Record<string, number>;
  guaranteed_total: number;
  dc_withdrawal_gross: number;
  dc_tax_free_portion: number;
  tf_withdrawal: number;
  withdrawal_detail: Record<string, number>;
  total_taxable_income: number;
  tax_due: number;
  tax_breakdown: TaxResult;
  net_income_achieved: number;
  shortfall: boolean;
  pot_balances: Record<string, number>;
  tf_balances: Record<string, number>;
  total_capital: number;
  pot_pnl: Record<string, PotPnl>;
}

export interface ProjectionSummary {
  sustainable: boolean;
  first_shortfall_age: number | null;
  end_age: number;
  anchor_age: number;
  is_post_retirement: boolean;
  num_years: number;
  remaining_capital: number;
  remaining_pots: Record<string, number>;
  remaining_tf: Record<string, number>;
  total_tax_paid: number;
  avg_effective_tax_rate: number;
  first_pot_exhausted_age: number | null;
  depletion_events: DepletionEvent[];
}

export interface ProjectionResult {
  years: YearRow[];
  summary: ProjectionSummary;
  warnings: string[];
  monthly_rows?: MonthlyRow[];
}

export interface MonthlyRow {
  year: number;
  month: number;
  age: number;
  month_in_year: number;
  target_monthly: number;
  guaranteed_detail: Record<string, number>;
  guaranteed_total: number;
  withdrawal_detail: Record<string, number>;
  withdrawal_total: number;
  gross_income: number;
  dc_balances: Record<string, number>;
  tf_balances: Record<string, number>;
  total_capital: number;
  depleted_this_month: string[];
}
