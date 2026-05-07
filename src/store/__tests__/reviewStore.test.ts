import { beforeEach, describe, expect, it } from 'vitest';
import { addReview, loadReviewStore } from '../reviewStore';
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
      strategy: 'fixed_target',
      strategy_params: {},
      tax_context: taxContext,
      notes: 'annual review',
    });

    const stored = loadReviewStore();
    expect(stored.reviews[0]?.tax_context).toEqual(taxContext);
  });
});
