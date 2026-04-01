/**
 * Cross-check: V2 TypeScript engine vs V1 Python engine
 *
 * Baseline numbers captured from V1 running config_default.json
 * (dump_v1_baseline.py on 2026-04-01).
 */
import { describe, it, expect } from 'vitest';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';

const result = runProjection(DEFAULT_CONFIG);
const s = result.summary;
const y1 = result.years[0]!;
const yLast = result.years[result.years.length - 1]!;

// Tolerance: allow ±£1 for rounding differences between Python/TS floats
const TOL = 1;
// Wider tolerance for cumulative values (compound over 23 years)
const TOL_CUM = 50;

describe('V1 ↔ V2 Cross-check — Summary', () => {
  it('sustainable', () => {
    expect(s.sustainable).toBe(true);
  });

  it('first_shortfall_age', () => {
    expect(s.first_shortfall_age).toBeNull();
  });

  it('end_age', () => {
    expect(s.end_age).toBe(90);
  });

  it('anchor_age', () => {
    expect(s.anchor_age).toBe(68);
  });

  it('is_post_retirement', () => {
    expect(s.is_post_retirement).toBe(false);
  });

  it('num_years', () => {
    expect(s.num_years).toBe(23);
  });

  it('remaining_capital ≈ 334976.62', () => {
    expect(s.remaining_capital).toBeCloseTo(334976.62, -1);
  });

  it('total_tax_paid ≈ 129055.25', () => {
    expect(Math.abs(s.total_tax_paid - 129055.25)).toBeLessThan(TOL_CUM);
  });

  it('avg_effective_tax_rate ≈ 12.2', () => {
    expect(Math.abs(s.avg_effective_tax_rate - 12.2)).toBeLessThan(0.5);
  });

  it('first_pot_exhausted_age', () => {
    expect(s.first_pot_exhausted_age).toBe(82);
  });

  it('depletion_events', () => {
    expect(s.depletion_events.length).toBe(1);
    expect(s.depletion_events[0]!.pot).toBe('Employer DC Pot');
    expect(s.depletion_events[0]!.age).toBe(82);
  });

  it('remaining Consolidated DC Pot ≈ 287576.03', () => {
    expect(Math.abs(s.remaining_pots['Consolidated DC Pot']! - 287576.03)).toBeLessThan(TOL_CUM);
  });

  it('remaining Employer DC Pot = 0', () => {
    expect(s.remaining_pots['Employer DC Pot']).toBe(0);
  });

  it('remaining ISA ≈ 47400.59', () => {
    expect(Math.abs(s.remaining_tf['ISA']! - 47400.59)).toBeLessThan(TOL_CUM);
  });
});

describe('V1 ↔ V2 Cross-check — Year 1 (age 68)', () => {
  it('age', () => {
    expect(y1.age).toBe(68);
  });

  it('target_net ≈ 30000', () => {
    expect(Math.abs(y1.target_net - 30000)).toBeLessThan(TOL);
  });

  it('guaranteed_total ≈ 25767.70', () => {
    expect(Math.abs(y1.guaranteed_total - 25767.70)).toBeLessThan(TOL);
  });

  it('UK State Pension ≈ 14930.72', () => {
    expect(Math.abs(y1.guaranteed_income['UK State Pension']! - 14930.72)).toBeLessThan(TOL);
  });

  it('BP Pension (DB) ≈ 10836.98', () => {
    expect(Math.abs(y1.guaranteed_income['BP Pension (DB)']! - 10836.98)).toBeLessThan(TOL);
  });

  it('dc_withdrawal_gross ≈ 7348.67', () => {
    expect(Math.abs(y1.dc_withdrawal_gross - 7348.67)).toBeLessThan(TOL);
  });

  it('dc_tax_free_portion ≈ 1837.17', () => {
    expect(Math.abs(y1.dc_tax_free_portion - 1837.17)).toBeLessThan(TOL);
  });

  it('tf_withdrawal = 0', () => {
    expect(y1.tf_withdrawal).toBeCloseTo(0, 0);
  });

  it('total_taxable_income ≈ 31279.20', () => {
    expect(Math.abs(y1.total_taxable_income - 31279.20)).toBeLessThan(TOL);
  });

  it('tax_due ≈ 2705.84', () => {
    expect(Math.abs(y1.tax_due - 2705.84)).toBeLessThan(TOL);
  });

  it('net_income_achieved ≈ 30410.53', () => {
    expect(Math.abs(y1.net_income_achieved - 30410.53)).toBeLessThan(TOL);
  });

  it('shortfall = false', () => {
    expect(y1.shortfall).toBe(false);
  });

  it('total_capital ≈ 320401.06', () => {
    expect(Math.abs(y1.total_capital - 320401.06)).toBeLessThan(TOL);
  });

  it('Consolidated DC Pot balance ≈ 200047.12', () => {
    expect(Math.abs(y1.pot_balances['Consolidated DC Pot']! - 200047.12)).toBeLessThan(TOL);
  });

  it('Employer DC Pot balance ≈ 98115.92', () => {
    expect(Math.abs(y1.pot_balances['Employer DC Pot']! - 98115.92)).toBeLessThan(TOL);
  });

  it('ISA balance ≈ 22238.02', () => {
    expect(Math.abs(y1.tf_balances['ISA']! - 22238.02)).toBeLessThan(TOL);
  });
});

describe('V1 ↔ V2 Cross-check — Last Year (age 90)', () => {
  it('age', () => {
    expect(yLast.age).toBe(90);
  });

  it('target_net ≈ 57483.10', () => {
    expect(Math.abs(yLast.target_net - 57483.10)).toBeLessThan(TOL_CUM);
  });

  it('net_income_achieved ≈ 58269.74', () => {
    expect(Math.abs(yLast.net_income_achieved - 58269.74)).toBeLessThan(TOL_CUM);
  });

  it('total_capital ≈ 334976.62', () => {
    expect(Math.abs(yLast.total_capital - 334976.62)).toBeLessThan(TOL_CUM);
  });

  it('shortfall = false', () => {
    expect(yLast.shortfall).toBe(false);
  });
});
