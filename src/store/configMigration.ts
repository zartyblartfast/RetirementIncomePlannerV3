import type { PlannerConfig } from '../engine/types';

type LegacyPlannerConfig = PlannerConfig & {
  personal?: PlannerConfig['personal'] & { retirement_age?: number };
};

export function normalizeLoadedConfig(raw: unknown): PlannerConfig {
  const cfg = raw as LegacyPlannerConfig;
  stripLegacyRetirementAge(cfg);
  return cfg as PlannerConfig;
}

export function stripLegacyRetirementAge(cfg: LegacyPlannerConfig | null | undefined): void {
  if (cfg?.personal && 'retirement_age' in cfg.personal) {
    delete cfg.personal.retirement_age;
  }
}
