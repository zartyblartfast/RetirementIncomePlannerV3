import { beforeEach, describe, expect, it } from 'vitest';
import { addReview, applyReviewToConfig, loadReviewStore } from '../reviewStore';
import { deriveTaxContext } from '../../engine/taxContext';
import { DEFAULT_CONFIG } from '../configStore';

describe('reviewStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists tax context on review snapshots', () => {
    const taxContext = deriveTaxContext(DEFAULT_CONFIG.tax);

    addReview({
      date: '2032-01',
      pot_balances: { 'DC Pension': 200_000 },
      income_since_last: {},
      guaranteed_monthly: { 'State Pension': 998 },
      guaranteed_income_update_mode: 'record_only',
      strategy: 'fixed_target',
      strategy_params: {},
      tax_context: taxContext,
      notes: 'annual review',
    });

    const stored = loadReviewStore();
    expect(stored.reviews[0]?.tax_context).toEqual(taxContext);
  });

  it('updates live pot balances and guaranteed-income assumptions when requested', () => {
    const next = applyReviewToConfig(DEFAULT_CONFIG, {
      id: 'review-1',
      date: '2032-03',
      pot_balances: { 'DC Pension': 175_000, ISA: 20_000 },
      income_since_last: {},
      guaranteed_monthly: { 'State Pension': 1_050 },
      guaranteed_income_update_mode: 'update_current_assumption',
      strategy: 'fixed_target',
      strategy_params: {},
      notes: '',
    });

    expect(next.dc_pots[0]?.starting_balance).toBe(175_000);
    expect(next.dc_pots[0]?.values_as_of).toBe('2032-03');
    expect(next.tax_free_accounts[0]?.starting_balance).toBe(20_000);
    expect(next.tax_free_accounts[0]?.values_as_of).toBe('2032-03');
    expect(next.guaranteed_income[0]?.gross_annual).toBe(12_600);
    expect(next.guaranteed_income[0]?.values_as_of).toBe('2032-03');
  });

  it('records guaranteed income without changing live assumptions when requested', () => {
    const next = applyReviewToConfig(DEFAULT_CONFIG, {
      id: 'review-2',
      date: '2032-04',
      pot_balances: { 'DC Pension': 160_000 },
      income_since_last: {},
      guaranteed_monthly: { 'State Pension': 1_100 },
      guaranteed_income_update_mode: 'record_only',
      strategy: 'fixed_target',
      strategy_params: {},
      notes: '',
    });

    expect(next.dc_pots[0]?.starting_balance).toBe(160_000);
    expect(next.guaranteed_income[0]?.gross_annual).toBe(DEFAULT_CONFIG.guaranteed_income[0]?.gross_annual);
    expect(next.guaranteed_income[0]?.values_as_of).toBe(DEFAULT_CONFIG.guaranteed_income[0]?.values_as_of);
  });

  it('records actual pension access separately from net income and live balances', () => {
    addReview({
      date: '2032-05',
      pot_balances: { 'DC Pension': 150_000 },
      income_since_last: { 'DC Pension': 0 },
      pension_access_since_last: { 'DC Pension': 25_000 },
      guaranteed_monthly: {},
      guaranteed_income_update_mode: 'record_only',
      strategy: 'fixed_target',
      strategy_params: {},
      notes: 'took TFC',
    });

    const stored = loadReviewStore();
    expect(stored.reviews[0]?.income_since_last['DC Pension']).toBe(0);
    expect(stored.reviews[0]?.pension_access_since_last?.['DC Pension']).toBe(25_000);

    const next = applyReviewToConfig(DEFAULT_CONFIG, stored.reviews[0]!);
    expect(next.dc_pots[0]?.starting_balance).toBe(150_000);
  });
});
