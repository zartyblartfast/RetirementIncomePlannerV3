import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../store/configStore';
import type { PlannerConfig } from '../types';
import {
  createInitialPensionLedgerStates,
  validatePensionLedgerState,
} from '../pensionLedgerState';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

describe('pension ledger state scaffold', () => {
  it('creates a standalone default ledger state for each DC pot without changing projection config', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    const ledgers = createInitialPensionLedgerStates(cfg);

    expect(ledgers).toEqual([
      {
        pot_ref: 'DC Pension',
        pot_name: 'DC Pension',
        uncrystallised_balance: cfg.dc_pots[0]!.starting_balance,
        crystallised_drawdown_balance: 0,
        tax_free_cash_taken: 0,
        taxable_drawdown_taken: 0,
        lsa_tracking_status: 'not_modelled',
        mpaa_triggered: false,
        warnings: [
          'lsa_not_modelled',
          'mpaa_prior_access_not_modelled',
          'provider_rules_not_modelled',
        ],
      },
    ]);
    expect(cfg.dc_pots[0]).not.toHaveProperty('pension_ledger_state');
  });

  it('does not silently assume LSA remaining when allowance tracking is not modelled', () => {
    const ledger = createInitialPensionLedgerStates(cloneConfig(DEFAULT_CONFIG))[0]!;

    expect(ledger.lsa_tracking_status).toBe('not_modelled');
    expect(ledger.lsa_used).toBeUndefined();
    expect(ledger.lsa_remaining).toBeUndefined();
  });

  it('validates MPAA trigger-date consistency', () => {
    const ledger = createInitialPensionLedgerStates(cloneConfig(DEFAULT_CONFIG))[0]!;

    expect(validatePensionLedgerState({
      ...ledger,
      mpaa_triggered: false,
      mpaa_trigger_date: '2032-01',
    })).toEqual([
      {
        code: 'mpaa_date_without_trigger',
        pot_ref: 'DC Pension',
        message: 'DC Pension has an MPAA trigger date but is not marked as MPAA-triggered.',
      },
    ]);
  });

  it('validates LSA tracking values only when tracking is explicitly enabled', () => {
    const ledger = createInitialPensionLedgerStates(cloneConfig(DEFAULT_CONFIG))[0]!;

    expect(validatePensionLedgerState({
      ...ledger,
      lsa_tracking_status: 'tracked',
      lsa_used: 25_000,
    })).toEqual([
      {
        code: 'tracked_lsa_missing_remaining',
        pot_ref: 'DC Pension',
        message: 'DC Pension tracks LSA usage but does not include an estimated LSA remaining value.',
      },
    ]);
  });

  it('validates non-negative ledger balances and totals', () => {
    const ledger = createInitialPensionLedgerStates(cloneConfig(DEFAULT_CONFIG))[0]!;

    expect(validatePensionLedgerState({
      ...ledger,
      crystallised_drawdown_balance: -1,
      tax_free_cash_taken: -1,
    })).toEqual([
      {
        code: 'negative_ledger_amount',
        pot_ref: 'DC Pension',
        field: 'crystallised_drawdown_balance',
        message: 'DC Pension has a negative crystallised_drawdown_balance ledger amount.',
      },
      {
        code: 'negative_ledger_amount',
        pot_ref: 'DC Pension',
        field: 'tax_free_cash_taken',
        message: 'DC Pension has a negative tax_free_cash_taken ledger amount.',
      },
    ]);
  });
});
