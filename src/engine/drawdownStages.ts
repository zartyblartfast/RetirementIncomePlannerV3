import type { DrawdownStageConfig, DrawdownStageSourceConfig, PlannerConfig } from './types';
import { normalizeWithdrawalPriority } from './withdrawalPriority';

type SourceLookup = {
  dc: Set<string>;
  taxFree: Set<string>;
};

const SHARE_TOLERANCE = 0.000001;

function buildSourceLookup(cfg: Pick<PlannerConfig, 'dc_pots' | 'tax_free_accounts'>): SourceLookup {
  return {
    dc: new Set((cfg.dc_pots ?? []).map((pot) => pot.name)),
    taxFree: new Set((cfg.tax_free_accounts ?? []).map((account) => account.name)),
  };
}

function sourceForName(name: string, lookup: SourceLookup): DrawdownStageSourceConfig | null {
  if (lookup.dc.has(name)) {
    return { source_type: 'dc_pot', source_name: name, target_share: 1 };
  }
  if (lookup.taxFree.has(name)) {
    return { source_type: 'tax_free_account', source_name: name, target_share: 1 };
  }
  return null;
}

export function deriveDrawdownStagesFromPriority(
  cfg: Pick<PlannerConfig, 'dc_pots' | 'tax_free_accounts' | 'withdrawal_priority'>,
): DrawdownStageConfig[] {
  const lookup = buildSourceLookup(cfg);
  const stages: DrawdownStageConfig[] = [];
  const seen = new Set<string>();

  for (const sourceName of cfg.withdrawal_priority ?? []) {
    if (seen.has(sourceName)) continue;
    const source = sourceForName(sourceName, lookup);
    if (!source) continue;
    stages.push({
      id: `legacy_stage_${stages.length + 1}`,
      sources: [source],
    });
    seen.add(sourceName);
  }

  return stages;
}

export function normalizeConfigDrawdownStages<T extends PlannerConfig>(cfg: T): T {
  if (!Array.isArray(cfg.drawdown_stages)) {
    cfg.drawdown_stages = deriveDrawdownStagesFromPriority(cfg);
  }
  return cfg;
}

export function resolveSequentialDrawdownPriority(cfg: PlannerConfig): string[] {
  if (!Array.isArray(cfg.drawdown_stages) || cfg.drawdown_stages.length === 0) {
    return normalizeWithdrawalPriority(cfg);
  }

  const sequentialSources: string[] = [];
  for (const stage of cfg.drawdown_stages) {
    if (!Array.isArray(stage.sources) || stage.sources.length !== 1) {
      return normalizeWithdrawalPriority(cfg);
    }
    const source = stage.sources[0]!;
    if (Math.abs(source.target_share - 1) > SHARE_TOLERANCE) {
      return normalizeWithdrawalPriority(cfg);
    }
    sequentialSources.push(source.source_name);
  }

  return normalizeWithdrawalPriority({ ...cfg, withdrawal_priority: sequentialSources });
}

function sourceKey(source: DrawdownStageSourceConfig): string {
  return `${source.source_type}:${source.source_name}`;
}

function syncWithdrawalPriorityFromDrawdownStages<T extends PlannerConfig>(cfg: T): T {
  if (!Array.isArray(cfg.drawdown_stages)) return cfg;
  cfg.withdrawal_priority = cfg.drawdown_stages.flatMap(stage =>
    stage.sources.map(source => source.source_name),
  );
  return cfg;
}

export function displayNameForDrawdownStage(stage: DrawdownStageConfig, stageIndex: number): string {
  const configured = typeof stage.name === 'string' ? stage.name.trim() : '';
  return configured || `Stage ${stageIndex + 1}`;
}

function rebalanceStageShares(stage: DrawdownStageConfig): DrawdownStageConfig {
  if (!Array.isArray(stage.sources) || stage.sources.length === 0) return stage;
  const finiteTotal = stage.sources.reduce(
    (total, source) => total + (Number.isFinite(source.target_share) && source.target_share > 0 ? source.target_share : 0),
    0,
  );
  if (finiteTotal <= 0) {
    const equalShare = 1 / stage.sources.length;
    return {
      ...stage,
      sources: stage.sources.map(source => ({ ...source, target_share: equalShare })),
    };
  }
  return {
    ...stage,
    sources: stage.sources.map(source => ({
      ...source,
      target_share: Number.isFinite(source.target_share) && source.target_share > 0
        ? source.target_share / finiteTotal
        : 0,
    })),
  };
}

export function renameDrawdownStageSource<T extends PlannerConfig>(cfg: T, oldName: string, newName: string): T {
  if (!Array.isArray(cfg.drawdown_stages)) return cfg;
  cfg.drawdown_stages = cfg.drawdown_stages.map(stage => ({
    ...stage,
    sources: stage.sources.map(source => source.source_name === oldName
      ? { ...source, source_name: newName }
      : source),
  }));
  return syncWithdrawalPriorityFromDrawdownStages(cfg);
}

function stageIdForNewSource(stages: DrawdownStageConfig[], sourceName: string): string {
  const slug = sourceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'source';
  const existingIds = new Set(stages.map(stage => stage.id));
  let suffix = stages.length + 1;
  let candidate = `stage_${slug}_${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `stage_${slug}_${suffix}`;
  }
  return candidate;
}

export function appendDrawdownStageForSource<T extends PlannerConfig>(cfg: T, sourceName: string): T {
  if (!Array.isArray(cfg.drawdown_stages)) {
    cfg.drawdown_stages = deriveDrawdownStagesFromPriority(cfg);
  }
  const lookup = buildSourceLookup(cfg);
  const source = sourceForName(sourceName, lookup);
  if (!source) return cfg;
  const exists = cfg.drawdown_stages.some(stage =>
    stage.sources.some(existing => sourceKey(existing) === sourceKey(source)),
  );
  if (exists) return cfg;
  cfg.drawdown_stages = [
    ...cfg.drawdown_stages,
    {
      id: stageIdForNewSource(cfg.drawdown_stages, sourceName),
      sources: [source],
    },
  ];
  return syncWithdrawalPriorityFromDrawdownStages(cfg);
}

export function removeDrawdownStageSource<T extends PlannerConfig>(cfg: T, sourceName: string): T {
  if (!Array.isArray(cfg.drawdown_stages)) return cfg;
  cfg.drawdown_stages = cfg.drawdown_stages
    .map(stage => ({
      ...stage,
      sources: stage.sources.filter(source => source.source_name !== sourceName),
    }))
    .filter(stage => stage.sources.length > 0)
    .map(rebalanceStageShares);
  return syncWithdrawalPriorityFromDrawdownStages(cfg);
}

export function moveDrawdownStage<T extends PlannerConfig>(cfg: T, stageIndex: number, direction: -1 | 1): T {
  if (!Array.isArray(cfg.drawdown_stages)) return cfg;
  const targetIndex = stageIndex + direction;
  if (stageIndex < 0 || targetIndex < 0 || stageIndex >= cfg.drawdown_stages.length || targetIndex >= cfg.drawdown_stages.length) {
    return cfg;
  }
  const stages = [...cfg.drawdown_stages];
  [stages[stageIndex], stages[targetIndex]] = [stages[targetIndex]!, stages[stageIndex]!];
  cfg.drawdown_stages = stages;
  return syncWithdrawalPriorityFromDrawdownStages(cfg);
}

export function validateDrawdownStages(cfg: Pick<PlannerConfig, 'dc_pots' | 'tax_free_accounts' | 'drawdown_stages'>): string[] {
  const errors: string[] = [];
  const stages = cfg.drawdown_stages ?? [];
  const lookup = buildSourceLookup(cfg);
  const stageIds = new Set<string>();

  for (const stage of stages) {
    const id = typeof stage.id === 'string' && stage.id.trim() !== '' ? stage.id : '(blank)';
    if (id === '(blank)') {
      errors.push('Drawdown stage id must be non-blank');
    } else if (stageIds.has(id)) {
      errors.push(`Duplicate drawdown stage id: ${id}`);
    } else {
      stageIds.add(id);
    }
  }

  for (const stage of stages) {
    const id = typeof stage.id === 'string' && stage.id.trim() !== '' ? stage.id : '(blank)';

    if (!Array.isArray(stage.sources) || stage.sources.length === 0) {
      errors.push(`Drawdown stage ${id} must contain at least one source`);
      continue;
    }

    const sourceKeys = new Set<string>();
    let shareTotal = 0;

    for (const source of stage.sources) {
      shareTotal += Number.isFinite(source.target_share) ? source.target_share : 0;
      const key = sourceKey(source);
      if (sourceKeys.has(key)) {
        errors.push(`Drawdown stage ${id} contains duplicate source: ${key}`);
      } else {
        sourceKeys.add(key);
      }

      if (source.source_type === 'dc_pot') {
        if (!lookup.dc.has(source.source_name)) {
          errors.push(`Drawdown stage ${id} references missing DC pot: ${source.source_name}`);
        }
      } else if (source.source_type === 'tax_free_account') {
        if (!lookup.taxFree.has(source.source_name)) {
          errors.push(`Drawdown stage ${id} references missing tax-free account: ${source.source_name}`);
        }
      } else {
        errors.push(`Drawdown stage ${id} has unknown source type: ${String(source.source_type)}`);
      }
    }

    if (Math.abs(shareTotal - 1) > SHARE_TOLERANCE) {
      errors.push(`Drawdown stage ${id} source shares must sum to 1.0`);
    }
  }

  return errors;
}
