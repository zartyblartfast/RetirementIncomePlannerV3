import { describe, it, expect } from 'vitest';
import { computeYearWorkings } from '../workings';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';
import { deriveTaxContext } from '../taxContext';

describe('computeYearWorkings', () => {
  const result = runProjection(DEFAULT_CONFIG);
  const yr1 = result.years[0]!;

  it('returns a WorkingsReport with steps', () => {
    const w = computeYearWorkings(yr1);
    expect(w).toHaveProperty('steps');
    expect(w.steps.length).toBeGreaterThan(0);
  });

  it('step labels are non-empty strings', () => {
    const w = computeYearWorkings(yr1);
    for (const step of w.steps) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });

  it('income_identity cross-check delta is less than 1', () => {
    const w = computeYearWorkings(yr1);
    const check = w.steps.find(s => s.id === 'income_identity');
    expect(check).toBeDefined();
    expect(check!.delta).toBeLessThan(1);
  });

  it('tax_recheck cross-check delta is less than 1', () => {
    const w = computeYearWorkings(yr1);
    const check = w.steps.find(s => s.id === 'tax_recheck');
    expect(check).toBeDefined();
    expect(check!.delta).toBeLessThan(1);
  });

  it('all cross-check steps have a delta defined', () => {
    const w = computeYearWorkings(yr1);
    const crossChecks = w.steps.filter(s => s.isCrossCheck);
    expect(crossChecks.length).toBeGreaterThan(0);
    for (const s of crossChecks) {
      expect(s.delta).toBeDefined();
    }
  });

  it('reports correct age and taxYear', () => {
    const w = computeYearWorkings(yr1);
    expect(w.age).toBe(yr1.age);
    expect(w.taxYear).toBe(yr1.tax_year);
  });

  it('includes supplied tax context for audit display', () => {
    const taxContext = deriveTaxContext(DEFAULT_CONFIG.tax);
    const w = computeYearWorkings(yr1, taxContext);

    expect(w.taxContext).toEqual(taxContext);
  });

  it('includes staged drawdown allocation detail when present on the year row', () => {
    const w = computeYearWorkings({
      ...yr1,
      drawdown_stage_allocations: [
        {
          stage_id: 'stage_blend',
          stage_name: 'Blend DC and ISA',
          source_type: 'dc_pot',
          source_name: 'Main DC',
          target_share: 0.5,
          actual_gross_withdrawal: 11000,
          actual_net_income: 10000,
          tax_free_amount: 2750,
          taxable_amount: 8250,
        },
      ],
    });

    const step = w.steps.find(s => s.id === 'drawdown_stage_allocation_stage_blend_Main_DC');
    expect(step).toBeDefined();
    expect(step!.label).toBe('Drawdown stage allocation: Blend DC and ISA / Main DC');
    expect(step!.formula).toContain('Target split 50%');
    expect(step!.formula).toContain('gross £11,000');
    expect(step!.formula).toContain('net £10,000');
    expect(step!.formula).toContain('tax-free £2,750');
    expect(step!.formula).toContain('taxable £8,250');
    expect(step!.value).toBe(10000);
  });
});
