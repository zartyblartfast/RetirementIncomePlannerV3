import { describe, expect, it } from 'vitest';
import type { DrawdownStageConfig } from '../../../engine/types';
import {
  formatDrawdownStageDetail,
  formatDrawdownStageSummary,
  formatDrawdownStageValidationMessages,
  formatDrawdownStrategySummary,
} from '../drawdownStageSummary';

describe('drawdown stage summary labels', () => {
  it('formats a named blended stage as source percentages', () => {
    const stage: DrawdownStageConfig = {
      id: 'stage_1',
      name: 'Bridge years',
      sources: [
        { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.6 },
        { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.4 },
      ],
    };

    expect(formatDrawdownStageSummary(stage, 0)).toBe('Bridge years — DC Pension 60.0% + ISA 40.0%');
  });

  it('falls back to ordinal stage names for unnamed stages', () => {
    const stage: DrawdownStageConfig = {
      id: 'stage_2',
      sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
    };

    expect(formatDrawdownStageSummary(stage, 1)).toBe('Stage 2 — DC Pension 100.0%');
  });

  it('formats a compact read-only strategy summary for dashboards', () => {
    const stages: DrawdownStageConfig[] = [
      {
        id: 'stage_1',
        name: 'Bridge years',
        sources: [
          { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.6 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.4 },
        ],
      },
      {
        id: 'stage_2',
        sources: [{ source_type: 'tax_free_account', source_name: 'Cash ISA', target_share: 1 }],
      },
    ];

    expect(formatDrawdownStrategySummary(stages)).toBe(
      'Bridge years — DC Pension 60.0% + ISA 40.0%; Stage 2 — Cash ISA 100.0%',
    );
  });

  it('formats explanatory stage details for the editable Optimise panel', () => {
    const blended: DrawdownStageConfig = {
      id: 'stage_1',
      name: 'Opening blend',
      sources: [
        { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.7 },
        { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.3 },
      ],
    };
    const draft: DrawdownStageConfig = { id: 'stage_2', sources: [] };

    expect(formatDrawdownStageDetail(blended, 0)).toBe(
      'Opening blend: blended stage using 70.0% DC Pension + 30.0% ISA',
    );
    expect(formatDrawdownStageDetail(draft, 1)).toBe('Stage 2: draft stage with no source yet');
  });

  it('uses stage display names and actionable wording for validation messages', () => {
    const stages: DrawdownStageConfig[] = [
      { id: 'stage_1', name: 'Opening blend', sources: [] },
      {
        id: 'stage_2',
        sources: [
          { source_type: 'dc_pot', source_name: 'Missing pension', target_share: 0.6 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.2 },
        ],
      },
    ];

    expect(formatDrawdownStageValidationMessages({
      dc_pots: [{ name: 'DC Pension', starting_balance: 1, growth_rate: 0, annual_fees: 0, tax_free_portion: 0.25 }],
      tax_free_accounts: [{ name: 'ISA', starting_balance: 1, growth_rate: 0 }],
    }, stages)).toEqual([
      'Opening blend needs at least one source before it can be used in projections.',
      'Stage 2 references missing DC pension source: Missing pension.',
      'Stage 2 source shares total 80.0%; they need to total 100.0%.',
    ]);
  });
});
