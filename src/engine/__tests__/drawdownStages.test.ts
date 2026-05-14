import { describe, expect, it } from 'vitest';
import type { PlannerConfig } from '../types';
import { DEFAULT_CONFIG } from '../../store/configStore';
import {
  deriveDrawdownStagesFromPriority,
  normalizeConfigDrawdownStages,
  validateDrawdownStages,
} from '../drawdownStages';

describe('drawdown stage migration', () => {
  it('derives deterministic one-source stages from legacy withdrawal_priority', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'DC Pension'],
    };

    expect(deriveDrawdownStagesFromPriority(cfg)).toEqual([
      {
        id: 'legacy_stage_1',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
      {
        id: 'legacy_stage_2',
        sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
      },
    ]);
  });

  it('adds migrated drawdown_stages when a loaded config has only withdrawal_priority', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'DC Pension'],
      drawdown_stages: undefined,
    } as PlannerConfig;

    const normalized = normalizeConfigDrawdownStages(cfg);

    expect(normalized.drawdown_stages).toEqual([
      {
        id: 'legacy_stage_1',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
      {
        id: 'legacy_stage_2',
        sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
      },
    ]);
  });
});

describe('drawdown stage validation', () => {
  it('reports duplicate stage IDs and invalid share totals without silently normalising intent', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      drawdown_stages: [
        {
          id: 'stage_dup',
          sources: [
            { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.25 },
            { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.25 },
          ],
        },
        {
          id: 'stage_dup',
          sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
        },
      ],
    };

    expect(validateDrawdownStages(cfg)).toEqual([
      'Duplicate drawdown stage id: stage_dup',
      'Drawdown stage stage_dup source shares must sum to 1.0',
    ]);
  });

  it('reports duplicate sources and unknown sources', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      drawdown_stages: [
        {
          id: 'stage_1',
          sources: [
            { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.5 },
            { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.5 },
          ],
        },
        {
          id: 'stage_2',
          sources: [{ source_type: 'tax_free_account', source_name: 'Missing ISA', target_share: 1 }],
        },
      ],
    };

    expect(validateDrawdownStages(cfg)).toEqual([
      'Drawdown stage stage_1 contains duplicate source: dc_pot:DC Pension',
      'Drawdown stage stage_2 references missing tax-free account: Missing ISA',
    ]);
  });
});
