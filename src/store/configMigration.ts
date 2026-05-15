import type { PlannerConfig } from '../engine/types';
import { normalizeConfigAssetAllocations } from '../engine/assetAllocation';
import { normalizeConfigDrawdownStages } from '../engine/drawdownStages';
import { normalizeConfigWithdrawalPriority } from '../engine/withdrawalPriority';

type LegacyPlannerConfig = PlannerConfig & {
  personal?: PlannerConfig['personal'] & { retirement_age?: number };
};

export function normalizeLoadedConfig(raw: unknown): PlannerConfig {
  const cfg = raw as LegacyPlannerConfig;
  stripLegacyRetirementAge(cfg);
  normalizeIncomeSources(cfg);
  return normalizeConfigDrawdownStages(
    normalizeConfigWithdrawalPriority(normalizeConfigAssetAllocations(cfg as PlannerConfig)),
    { repairEmptyStages: true },
  );
}

export function stripLegacyRetirementAge(cfg: LegacyPlannerConfig | null | undefined): void {
  if (cfg?.personal && 'retirement_age' in cfg.personal) {
    delete cfg.personal.retirement_age;
  }
}

export function normalizeIncomeSources(cfg: LegacyPlannerConfig | null | undefined): void {
  if (!Array.isArray(cfg?.guaranteed_income)) return;
  for (const income of cfg.guaranteed_income) {
    const candidate = income as PlannerConfig['guaranteed_income'][number] & { income_type?: string };
    if (!candidate.income_type) {
      candidate.income_type = candidate.name?.toLowerCase().includes('state pension')
        ? 'state_pension'
        : 'defined_benefit';
    }
    if (candidate.end_date === undefined) {
      candidate.end_date = null;
    }
  }
}
