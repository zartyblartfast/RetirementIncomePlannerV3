import { describe, expect, it } from 'vitest';
import type { DrawdownStageConfig } from '../../../engine/types';
import { formatDrawdownStageSummary, formatDrawdownStrategySummary } from '../drawdownStageSummary';

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
});
