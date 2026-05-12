import type { PlannerConfig } from '../engine/types';
import { normalizeConfigAssetAllocations } from '../engine/assetAllocation';
import { normalizeConfigWithdrawalPriority } from '../engine/withdrawalPriority';

type LegacyPlannerConfig = PlannerConfig & {
  personal?: PlannerConfig['personal'] & { retirement_age?: number };
};

export function normalizeLoadedConfig(raw: unknown): PlannerConfig {
  const cfg = raw as LegacyPlannerConfig;
  stripLegacyRetirementAge(cfg);
  return normalizeConfigWithdrawalPriority(normalizeConfigAssetAllocations(cfg as PlannerConfig));
}

export function stripLegacyRetirementAge(cfg: LegacyPlannerConfig | null | undefined): void {
  if (cfg?.personal && 'retirement_age' in cfg.personal) {
    delete cfg.personal.retirement_age;
  }
}
