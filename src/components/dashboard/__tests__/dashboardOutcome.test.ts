import { describe, expect, it } from 'vitest';
import type { ProjectionSummary } from '../../../engine/types';
import { dashboardOutcome } from '../dashboardOutcome';

const summary: ProjectionSummary = {
  sustainable: true,
  first_shortfall_age: null,
  end_age: 92,
  anchor_age: 65,
  is_post_retirement: false,
  num_years: 28,
  remaining_capital: 0,
  remaining_pots: {},
  remaining_tf: {},
  total_tax_paid: 0,
  avg_effective_tax_rate: 0,
  first_pot_exhausted_age: 78,
  depletion_events: [],
};

describe('dashboardOutcome', () => {
  it('uses the summary without treating a pot depletion as an income alarm', () => {
    const result = dashboardOutcome(summary, false);
    expect(result.headline).toContain('income target through age 92');
    expect(result.needsAttention).toBe(false);
  });
  it('uses benchmark language for portfolio-driven strategies', () => {
    const result = dashboardOutcome({ ...summary, first_shortfall_age: 84 }, true);
    expect(result.headline).toContain('age 84');
    expect(result.explanation).toContain('strategy-derived spending estimate');
    expect(result.needsAttention).toBe(true);
  });
  it('does not misstate a portfolio-driven result as meeting the planning benchmark', () => {
    const result = dashboardOutcome(summary, true);
    expect(result.headline).toContain('strategy spending rule');
    expect(result.explanation).toContain('not the separate planning benchmark');
  });
  it('does not claim success for an empty projection', () => {
    expect(dashboardOutcome({ ...summary, num_years: 0 }, false).headline).toBe('No projection available yet');
  });
});
