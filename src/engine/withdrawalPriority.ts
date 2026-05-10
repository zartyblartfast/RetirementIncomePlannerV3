import type { PlannerConfig } from './types';

export function getDrawableSourceNames(cfg: Pick<PlannerConfig, 'dc_pots' | 'tax_free_accounts'>): string[] {
  const sources: string[] = [];
  const seen = new Set<string>();

  for (const pot of cfg.dc_pots ?? []) {
    if (typeof pot.name === 'string' && pot.name.trim() !== '' && !seen.has(pot.name)) {
      sources.push(pot.name);
      seen.add(pot.name);
    }
  }

  for (const account of cfg.tax_free_accounts ?? []) {
    if (typeof account.name === 'string' && account.name.trim() !== '' && !seen.has(account.name)) {
      sources.push(account.name);
      seen.add(account.name);
    }
  }

  return sources;
}

export function normalizeWithdrawalPriority(
  cfg: Pick<PlannerConfig, 'dc_pots' | 'tax_free_accounts'> & { withdrawal_priority?: unknown },
): string[] {
  const sources = getDrawableSourceNames(cfg);
  const validSources = new Set(sources);
  const normalized: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(cfg.withdrawal_priority)) {
    for (const source of cfg.withdrawal_priority) {
      if (
        typeof source === 'string'
        && validSources.has(source)
        && !seen.has(source)
      ) {
        normalized.push(source);
        seen.add(source);
      }
    }
  }

  for (const source of sources) {
    if (!seen.has(source)) {
      normalized.push(source);
    }
  }

  return normalized;
}

export function normalizeConfigWithdrawalPriority<T extends PlannerConfig>(cfg: T): T {
  cfg.withdrawal_priority = normalizeWithdrawalPriority(cfg);
  return cfg;
}
