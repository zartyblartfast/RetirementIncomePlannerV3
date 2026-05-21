import type { PensionLedgerState, PlannerConfig } from './types';

export type PensionLedgerValidationCode =
  | 'mpaa_date_without_trigger'
  | 'tracked_lsa_missing_used'
  | 'tracked_lsa_missing_remaining'
  | 'negative_ledger_amount';

export interface PensionLedgerValidationIssue {
  code: PensionLedgerValidationCode;
  pot_ref: string;
  field?: keyof PensionLedgerState;
  message: string;
}

const DEFAULT_LEDGER_WARNINGS: PensionLedgerState['warnings'] = [
  'lsa_not_modelled',
  'mpaa_prior_access_not_modelled',
  'provider_rules_not_modelled',
];

export function createInitialPensionLedgerStates(cfg: PlannerConfig): PensionLedgerState[] {
  return (cfg.dc_pots ?? []).map(pot => ({
    pot_ref: pot.name,
    pot_name: pot.name,
    uncrystallised_balance: pot.starting_balance,
    crystallised_drawdown_balance: 0,
    tax_free_cash_taken: 0,
    taxable_drawdown_taken: 0,
    lsa_tracking_status: 'not_modelled',
    mpaa_triggered: false,
    warnings: [...DEFAULT_LEDGER_WARNINGS],
  }));
}

export function validatePensionLedgerState(ledger: PensionLedgerState): PensionLedgerValidationIssue[] {
  const issues: PensionLedgerValidationIssue[] = [];

  if (!ledger.mpaa_triggered && ledger.mpaa_trigger_date) {
    issues.push({
      code: 'mpaa_date_without_trigger',
      pot_ref: ledger.pot_ref,
      message: `${ledger.pot_name} has an MPAA trigger date but is not marked as MPAA-triggered.`,
    });
  }

  if (ledger.lsa_tracking_status === 'tracked') {
    if (ledger.lsa_used === undefined) {
      issues.push({
        code: 'tracked_lsa_missing_used',
        pot_ref: ledger.pot_ref,
        message: `${ledger.pot_name} tracks LSA usage but does not include an estimated LSA used value.`,
      });
    }
    if (ledger.lsa_remaining === undefined) {
      issues.push({
        code: 'tracked_lsa_missing_remaining',
        pot_ref: ledger.pot_ref,
        message: `${ledger.pot_name} tracks LSA usage but does not include an estimated LSA remaining value.`,
      });
    }
  }

  const nonNegativeFields: Array<keyof PensionLedgerState> = [
    'uncrystallised_balance',
    'crystallised_drawdown_balance',
    'tax_free_cash_taken',
    'taxable_drawdown_taken',
    'lsa_used',
    'lsa_remaining',
  ];

  for (const field of nonNegativeFields) {
    const value = ledger[field];
    if (typeof value === 'number' && value < 0) {
      issues.push({
        code: 'negative_ledger_amount',
        pot_ref: ledger.pot_ref,
        field,
        message: `${ledger.pot_name} has a negative ${field} ledger amount.`,
      });
    }
  }

  return issues;
}
