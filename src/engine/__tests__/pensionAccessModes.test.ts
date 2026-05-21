import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../store/configStore';
import { runProjection } from '../projection';
import type { PlannerConfig } from '../types';
import {
  describePensionAccessMode,
  normalizeConfigPensionAccessModes,
  validatePensionAccessModes,
} from '../pensionAccessModes';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

describe('pension access mode metadata', () => {
  it('adds explicit simplified pro-rata compatibility metadata to older DC pot configs', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    delete cfg.dc_pots[0]!.pension_access;

    const normalized = normalizeConfigPensionAccessModes(cfg);

    expect(normalized.dc_pots[0]!.pension_access).toEqual({
      category: 'compatibility_approximation',
      approximation: 'simplified_pro_rata',
    });
  });

  it('preserves projection outputs when only default pension access metadata is added', () => {
    const legacyCfg = cloneConfig(DEFAULT_CONFIG);
    delete legacyCfg.dc_pots[0]!.pension_access;
    const normalizedCfg = normalizeConfigPensionAccessModes(cloneConfig(legacyCfg));

    const legacyProjection = runProjection(legacyCfg);
    const normalizedProjection = runProjection(normalizedCfg);

    expect(normalizedProjection.years).toEqual(legacyProjection.years);
    expect(normalizedProjection.summary).toEqual(legacyProjection.summary);
  });

  it('keeps compatibility approximations structurally separate from explicit pension access routes', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dc_pots[0]!.pension_access = {
      category: 'explicit_access_route',
      event_type: 'ufpls',
    };

    const issues = validatePensionAccessModes(cfg);

    expect(issues).toEqual([
      {
        code: 'unsupported_explicit_access_route',
        pot_name: 'DC Pension',
        message: 'DC Pension uses explicit pension access route ufpls, but Dev03 currently supports only simplified pro-rata compatibility metadata without changing projection behaviour.',
      },
    ]);
  });

  it('describes simplified pro-rata as an approximation rather than a legal access route', () => {
    const cfg = normalizeConfigPensionAccessModes(cloneConfig(DEFAULT_CONFIG));

    expect(describePensionAccessMode(cfg.dc_pots[0]!)).toBe(
      'Simplified pro-rata pension withdrawals: this is a compatibility approximation, not a formal UFPLS or phased crystallisation ledger. Ordinary withdrawals continue to use the pot tax-free percentage until explicit pension-access routes are implemented.',
    );
  });
});
