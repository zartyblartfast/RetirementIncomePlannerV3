import { describe, it, expect } from 'vitest';
import { computeYearWorkings } from '../workings';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';

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
});
