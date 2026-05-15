import { describe, expect, it } from 'vitest';
import type { PlannerConfig } from '../types';
import { DEFAULT_CONFIG } from '../../store/configStore';
import {
  appendDrawdownStageForSource,
  deriveDrawdownStagesFromPriority,
  displayNameForDrawdownStage,
  moveDrawdownStage,
  normalizeConfigDrawdownStages,
  removeDrawdownStageSource,
  renameDrawdownStageSource,
  updateDrawdownStageName,
  updateDrawdownStageSourceShare,
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


describe('drawdown stage source maintenance', () => {
  it('renames staged sources when a pot/account is renamed', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      drawdown_stages: [
        {
          id: 'stage_1',
          sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
        },
      ],
    };

    renameDrawdownStageSource(cfg, 'DC Pension', 'Main pension');

    expect(cfg.drawdown_stages?.[0]?.sources[0]?.source_name).toBe('Main pension');
    expect(cfg.withdrawal_priority).toEqual(['Main pension']);
  });

  it('appends a one-source stage for a newly added source', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      dc_pots: [
        ...DEFAULT_CONFIG.dc_pots,
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Second pension' },
      ],
      drawdown_stages: deriveDrawdownStagesFromPriority(DEFAULT_CONFIG),
    };

    appendDrawdownStageForSource(cfg, 'Second pension');

    const lastStage = cfg.drawdown_stages?.[cfg.drawdown_stages.length - 1];
    expect(lastStage).toEqual({
      id: 'stage_second_pension_3',
      sources: [
        { source_type: 'dc_pot', source_name: 'Second pension', target_share: 1 },
      ],
    });
    expect(cfg.withdrawal_priority).toEqual(['DC Pension', 'ISA', 'Second pension']);
  });

  it('removes deleted sources and rebalances the remaining stage shares', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      drawdown_stages: [
        {
          id: 'stage_1',
          sources: [
            { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.25 },
            { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.75 },
          ],
        },
      ],
    };

    removeDrawdownStageSource(cfg, 'ISA');

    expect(cfg.drawdown_stages).toEqual([
      {
        id: 'stage_1',
        sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
      },
    ]);
    expect(cfg.withdrawal_priority).toEqual(['DC Pension']);
  });

  it('moves drawdown stages and keeps legacy withdrawal_priority in the same visible order', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['DC Pension', 'ISA'],
      drawdown_stages: [
        {
          id: 'stage_1',
          sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
        },
        {
          id: 'stage_2',
          sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
        },
      ],
    };

    moveDrawdownStage(cfg, 1, -1);

    expect(cfg.drawdown_stages?.map(stage => stage.id)).toEqual(['stage_2', 'stage_1']);
    expect(cfg.withdrawal_priority).toEqual(['ISA', 'DC Pension']);
  });

  it('uses configured stage names or deterministic fallback labels for display', () => {
    expect(displayNameForDrawdownStage({ id: 'stage_1', name: 'Bridge years', sources: [] }, 0)).toBe('Bridge years');
    expect(displayNameForDrawdownStage({ id: 'stage_2', sources: [] }, 1)).toBe('Stage 2');
  });

  it('updates editable stage names without changing source order', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['DC Pension', 'ISA'],
      drawdown_stages: [
        {
          id: 'stage_1',
          sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
        },
      ],
    };

    updateDrawdownStageName(cfg, 0, 'Bridge years');

    expect(cfg.drawdown_stages?.[0]?.name).toBe('Bridge years');
    expect(cfg.withdrawal_priority).toEqual(['DC Pension']);
  });

  it('keeps blended stage source shares summing to 100% when one percentage is edited', () => {
    const cfg: PlannerConfig = {
      ...DEFAULT_CONFIG,
      drawdown_stages: [
        {
          id: 'stage_1',
          sources: [
            { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.5 },
            { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.3 },
            { source_type: 'tax_free_account', source_name: 'Second ISA', target_share: 0.2 },
          ],
        },
      ],
    };

    updateDrawdownStageSourceShare(cfg, 0, 0, 0.6);

    expect(cfg.drawdown_stages?.[0]?.sources[0]?.target_share).toBeCloseTo(0.6);
    expect(cfg.drawdown_stages?.[0]?.sources[1]?.target_share).toBeCloseTo(0.24);
    expect(cfg.drawdown_stages?.[0]?.sources[2]?.target_share).toBeCloseTo(0.16);
    expect(validateDrawdownStages({
      ...cfg,
      tax_free_accounts: [
        ...DEFAULT_CONFIG.tax_free_accounts,
        { ...DEFAULT_CONFIG.tax_free_accounts[0]!, name: 'Second ISA' },
      ],
    })).toEqual([]);
  });
});
