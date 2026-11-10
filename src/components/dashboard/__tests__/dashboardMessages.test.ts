import { describe, expect, it } from 'vitest';
import type { ProjectionResult } from '../../../engine/types';
import { dashboardMessages } from '../dashboardMessages';

describe('dashboardMessages', () => {
  it('shows only matching structured depletion warnings as milestones', () => {
    const result = {
      warnings: ['ISA exhausted at age 78 month 2', 'Ledger-aware FAD shortfall', 'Unknown exhausted at age 80 month 1'],
      summary: { depletion_events: [{ pot: 'ISA', age: 78, month: 2 }] },
    } as ProjectionResult;
    expect(dashboardMessages(result)).toEqual({
      warnings: ['Ledger-aware FAD shortfall', 'Unknown exhausted at age 80 month 1'],
      milestones: ['ISA exhausted at age 78 month 2'],
    });
  });
});
