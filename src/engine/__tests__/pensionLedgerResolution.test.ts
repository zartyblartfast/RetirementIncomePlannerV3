import { describe, expect, it } from 'vitest';
import type { PensionLedgerState } from '../types';
import {
  applyPensionLedgerEvent,
  summarizePensionLedgerStates,
  type PensionLedgerResolutionEvent,
} from '../pensionLedgerResolution';

function ledger(overrides: Partial<PensionLedgerState> = {}): PensionLedgerState {
  return {
    pot_ref: 'DC Pension',
    pot_name: 'DC Pension',
    uncrystallised_balance: 100_000,
    crystallised_drawdown_balance: 0,
    tax_free_cash_taken: 0,
    taxable_drawdown_taken: 0,
    lsa_tracking_status: 'not_modelled',
    mpaa_triggered: false,
    warnings: ['lsa_not_modelled', 'mpaa_prior_access_not_modelled', 'provider_rules_not_modelled'],
    ...overrides,
  };
}

describe('pension ledger resolution', () => {
  it('applies UFPLS against uncrystallised funds using an explicit tax-free/taxable split and MPAA trigger', () => {
    const start = ledger();
    const result = applyPensionLedgerEvent(start, {
      id: 'ufpls_1',
      event_type: 'ufpls',
      date: '2032-01',
      gross_amount: 20_000,
    });

    expect(result.outcome).toBe('applied');
    expect(result.tax_free_amount).toBe(5_000);
    expect(result.taxable_amount).toBe(15_000);
    expect(result.ledger).toMatchObject({
      uncrystallised_balance: 80_000,
      crystallised_drawdown_balance: 0,
      tax_free_cash_taken: 5_000,
      taxable_drawdown_taken: 15_000,
      mpaa_triggered: true,
      mpaa_trigger_date: '2032-01',
    });
    expect(result.warnings).toContain('ufpls_tax_free_fraction_assumed_25pct');
    expect(result.warnings).toContain('mpaa_triggered_by_ufpls');
    expect(start.uncrystallised_balance).toBe(100_000);
  });

  it('does not overwrite an existing MPAA trigger date on later UFPLS events', () => {
    const result = applyPensionLedgerEvent(
      ledger({ mpaa_triggered: true, mpaa_trigger_date: '2031-06' }),
      {
        id: 'ufpls_2',
        event_type: 'ufpls',
        date: '2032-01',
        gross_amount: 10_000,
      },
    );

    expect(result.ledger.mpaa_triggered).toBe(true);
    expect(result.ledger.mpaa_trigger_date).toBe('2031-06');
    expect(result.warnings).not.toContain('mpaa_triggered_by_ufpls');
  });

  it('applies UFPLS only to uncrystallised funds in a partially crystallised pot', () => {
    const result = applyPensionLedgerEvent(
      ledger({ uncrystallised_balance: 60_000, crystallised_drawdown_balance: 40_000 }),
      {
        id: 'ufpls_partial',
        event_type: 'ufpls',
        date: '2032-01',
        gross_amount: 10_000,
      },
    );

    expect(result.ledger.uncrystallised_balance).toBe(50_000);
    expect(result.ledger.crystallised_drawdown_balance).toBe(40_000);
  });

  it('caps tracked UFPLS tax-free cash at remaining LSA and treats the excess as taxable', () => {
    const result = applyPensionLedgerEvent(
      ledger({ lsa_tracking_status: 'tracked', lsa_used: 260_000, lsa_remaining: 8_275 }),
      {
        id: 'ufpls_lsa',
        event_type: 'ufpls',
        date: '2032-01',
        gross_amount: 40_000,
      },
    );

    expect(result.tax_free_amount).toBe(8_275);
    expect(result.taxable_amount).toBe(31_725);
    expect(result.ledger.lsa_used).toBe(268_275);
    expect(result.ledger.lsa_remaining).toBe(0);
    expect(result.warnings).toContain('lsa_exceeded_ufpls_tax_free_reduced');
  });

  it('crystallises a slice, pays PCLS, moves the remainder to crystallised drawdown, and does not trigger MPAA', () => {
    const result = applyPensionLedgerEvent(ledger(), {
      id: 'pcls_1',
      event_type: 'crystallise_and_take_pcls',
      date: '2032-01',
      crystallise_amount: 40_000,
      tax_free_cash_amount: 10_000,
    });

    expect(result.outcome).toBe('applied');
    expect(result.tax_free_amount).toBe(10_000);
    expect(result.taxable_amount).toBe(0);
    expect(result.ledger).toMatchObject({
      uncrystallised_balance: 60_000,
      crystallised_drawdown_balance: 30_000,
      tax_free_cash_taken: 10_000,
      taxable_drawdown_taken: 0,
      mpaa_triggered: false,
    });
    expect(result.warnings).toContain('mpaa_not_triggered_pcls_only');
  });

  it('caps PCLS at 25% of the crystallised amount before moving the balance to drawdown', () => {
    const result = applyPensionLedgerEvent(ledger(), {
      id: 'pcls_cap',
      event_type: 'crystallise_and_take_pcls',
      date: '2032-01',
      crystallise_amount: 40_000,
      tax_free_cash_amount: 15_000,
    });

    expect(result.tax_free_amount).toBe(10_000);
    expect(result.ledger.crystallised_drawdown_balance).toBe(30_000);
    expect(result.warnings).toContain('pcls_capped_at_25pct_of_crystallised');
  });

  it('applies taxable flexi-access drawdown from crystallised funds and triggers MPAA once', () => {
    const result = applyPensionLedgerEvent(
      ledger({ uncrystallised_balance: 50_000, crystallised_drawdown_balance: 50_000 }),
      {
        id: 'fad_1',
        event_type: 'taxable_flexi_access_drawdown',
        date: '2032-02',
        gross_amount: 12_000,
      },
    );

    expect(result.outcome).toBe('applied');
    expect(result.tax_free_amount).toBe(0);
    expect(result.taxable_amount).toBe(12_000);
    expect(result.ledger.crystallised_drawdown_balance).toBe(38_000);
    expect(result.ledger.taxable_drawdown_taken).toBe(12_000);
    expect(result.ledger.mpaa_triggered).toBe(true);
    expect(result.ledger.mpaa_trigger_date).toBe('2032-02');
    expect(result.warnings).toContain('mpaa_triggered_by_taxable_drawdown');
  });

  it('does not overdraw crystallised funds for taxable drawdown', () => {
    const result = applyPensionLedgerEvent(
      ledger({ crystallised_drawdown_balance: 5_000 }),
      {
        id: 'fad_too_much',
        event_type: 'taxable_flexi_access_drawdown',
        date: '2032-02',
        gross_amount: 10_000,
      },
    );

    expect(result.outcome).toBe('insufficient_balance');
    expect(result.ledger.crystallised_drawdown_balance).toBe(5_000);
    expect(result.taxable_amount).toBe(0);
    expect(result.warnings).toContain('crystallised_balance_insufficient_for_drawdown');
  });

  it('applies same-month events in ledger-safe order regardless of input order', () => {
    const events: PensionLedgerResolutionEvent[] = [
      {
        id: 'fad_same_month',
        event_type: 'taxable_flexi_access_drawdown',
        date: '2032-01',
        gross_amount: 15_000,
      },
      {
        id: 'pcls_same_month',
        event_type: 'crystallise_and_take_pcls',
        date: '2032-01',
        crystallise_amount: 80_000,
        tax_free_cash_amount: 20_000,
      },
    ];

    const result = applyPensionLedgerEvent(ledger(), events);

    expect(result.outcome).toBe('applied');
    expect(result.ledger.uncrystallised_balance).toBe(20_000);
    expect(result.ledger.crystallised_drawdown_balance).toBe(45_000);
    expect(result.applied_events.map(event => event.id)).toEqual(['pcls_same_month', 'fad_same_month']);
  });

  it('summarises plan-level LSA and MPAA across pot ledgers', () => {
    const summary = summarizePensionLedgerStates([
      ledger({ pot_ref: 'A', pot_name: 'A', lsa_tracking_status: 'tracked', lsa_used: 30_000, lsa_remaining: 238_275 }),
      ledger({ pot_ref: 'B', pot_name: 'B', lsa_tracking_status: 'tracked', lsa_used: 20_000, lsa_remaining: 248_275, mpaa_triggered: true, mpaa_trigger_date: '2032-03' }),
    ]);

    expect(summary.lsa_used_total).toBe(50_000);
    expect(summary.lsa_remaining_total).toBe(218_275);
    expect(summary.mpaa_triggered).toBe(true);
    expect(summary.mpaa_trigger_date).toBe('2032-03');
  });
});
