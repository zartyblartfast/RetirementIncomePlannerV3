import type { DCPotConfig, DCPotPensionAccessConfig, PlannerConfig } from './types';

export const DEFAULT_PENSION_ACCESS_MODE: DCPotPensionAccessConfig = {
  category: 'compatibility_approximation',
  approximation: 'simplified_pro_rata',
};

export type PensionAccessModeValidationCode = 'unsupported_explicit_access_route' | 'invalid_pension_access_mode';

export interface PensionAccessModeValidationIssue {
  code: PensionAccessModeValidationCode;
  pot_name: string;
  message: string;
}

export function normalizePensionAccessModeForPot(pot: DCPotConfig): DCPotConfig {
  const existing = pot.pension_access;

  if (existing?.category === 'compatibility_approximation' && existing.approximation === 'simplified_pro_rata') {
    return { ...pot, pension_access: existing };
  }

  if (existing?.category === 'explicit_access_route') {
    return { ...pot, pension_access: existing };
  }

  return { ...pot, pension_access: DEFAULT_PENSION_ACCESS_MODE };
}

export function normalizeConfigPensionAccessModes(cfg: PlannerConfig): PlannerConfig {
  if (!Array.isArray(cfg.dc_pots)) return cfg;
  return {
    ...cfg,
    dc_pots: cfg.dc_pots.map(normalizePensionAccessModeForPot),
  };
}

export function validatePensionAccessModes(cfg: PlannerConfig): PensionAccessModeValidationIssue[] {
  const issues: PensionAccessModeValidationIssue[] = [];

  for (const pot of cfg.dc_pots ?? []) {
    const mode = pot.pension_access;
    if (!mode) continue;

    if (mode.category === 'explicit_access_route') {
      issues.push({
        code: 'unsupported_explicit_access_route',
        pot_name: pot.name,
        message: `${pot.name} uses explicit pension access route ${mode.event_type}, but Dev03 currently supports only simplified pro-rata compatibility metadata without changing projection behaviour.`,
      });
      continue;
    }

    if (mode.category !== 'compatibility_approximation' || mode.approximation !== 'simplified_pro_rata') {
      issues.push({
        code: 'invalid_pension_access_mode',
        pot_name: pot.name,
        message: `${pot.name} uses an unsupported pension access mode.`,
      });
    }
  }

  return issues;
}

export function describePensionAccessMode(pot: DCPotConfig): string {
  const normalized = normalizePensionAccessModeForPot(pot);
  if (normalized.pension_access?.category === 'compatibility_approximation') {
    return 'Simplified pro-rata pension withdrawals: this is a compatibility approximation, not a formal UFPLS or phased crystallisation ledger. Ordinary withdrawals continue to use the pot tax-free percentage until explicit pension-access routes are implemented.';
  }

  return 'Explicit pension access route: configured for future ledger modelling but not yet applied to projection behaviour.';
}
