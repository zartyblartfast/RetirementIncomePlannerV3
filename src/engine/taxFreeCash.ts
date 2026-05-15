import type { DCPotConfig, DCPotTaxFreeCashConfig, PlannerConfig } from './types';

export const DEFAULT_TAX_FREE_CASH_CONFIG: DCPotTaxFreeCashConfig = {
  mode: 'gradual_pro_rata',
  residual_mode: 'gradual_pro_rata',
};

export function normalizeTaxFreeCashConfigForPot(pot: DCPotConfig): DCPotConfig {
  const taxFreePortion = Number.isFinite(pot.tax_free_portion)
    ? Math.max(0, Math.min(1, pot.tax_free_portion))
    : 0.25;

  const existing = pot.tax_free_cash;
  const taxFreeCash: DCPotTaxFreeCashConfig = {
    ...DEFAULT_TAX_FREE_CASH_CONFIG,
    ...(existing ?? {}),
  };

  if (taxFreeCash.mode !== 'gradual_pro_rata') {
    taxFreeCash.mode = 'gradual_pro_rata';
  }
  taxFreeCash.residual_mode = 'gradual_pro_rata';
  delete taxFreeCash.upfront_amount;
  delete taxFreeCash.upfront_percentage_of_pot;
  delete taxFreeCash.event_date;
  delete taxFreeCash.destination;

  return {
    ...pot,
    tax_free_portion: taxFreePortion,
    tax_free_cash: taxFreeCash,
  };
}

export function normalizeConfigTaxFreeCash(cfg: PlannerConfig): PlannerConfig {
  if (!Array.isArray(cfg.dc_pots)) return cfg;
  cfg.dc_pots = cfg.dc_pots.map(normalizeTaxFreeCashConfigForPot);
  return cfg;
}

export function describeTaxFreeCashAssumption(pot: DCPotConfig): string {
  const normalized = normalizeTaxFreeCashConfigForPot(pot);
  const percentage = (normalized.tax_free_portion * 100).toFixed(1);
  return `Gradual pro-rata: ${percentage}% of each ${normalized.name} withdrawal is treated as tax-free; the remaining ${(100 - normalized.tax_free_portion * 100).toFixed(1)}% is taxable. No upfront tax-free lump sum or allowance tracking is modelled in this setting.`;
}
