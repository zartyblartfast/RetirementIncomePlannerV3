import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import { describeTaxFreeCashAssumption, normalizeConfigTaxFreeCash } from '../taxFreeCash';
import { DEFAULT_CONFIG } from '../../store/configStore';
import type { PlannerConfig } from '../types';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

describe('tax-free cash metadata', () => {
  it('adds gradual pro-rata metadata to older DC pot configs', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    delete cfg.dc_pots[0]!.tax_free_cash;

    const normalized = normalizeConfigTaxFreeCash(cfg);

    expect(normalized.dc_pots[0]!.tax_free_cash).toEqual({
      mode: 'gradual_pro_rata',
      residual_mode: 'gradual_pro_rata',
    });
    expect(normalized.dc_pots[0]!.tax_free_portion).toBe(0.25);
  });

  it('preserves projection outputs when only default metadata is added', () => {
    const legacyCfg = cloneConfig(DEFAULT_CONFIG);
    delete legacyCfg.dc_pots[0]!.tax_free_cash;
    const normalizedCfg = normalizeConfigTaxFreeCash(cloneConfig(legacyCfg));

    const legacyProjection = runProjection(legacyCfg);
    const normalizedProjection = runProjection(normalizedCfg);

    expect(normalizedProjection.years).toEqual(legacyProjection.years);
    expect(normalizedProjection.summary).toEqual(legacyProjection.summary);
  });

  it('describes the current gradual pro-rata assumption using the configured percentage', () => {
    const pot = { ...DEFAULT_CONFIG.dc_pots[0]!, tax_free_portion: 0.3 };

    expect(describeTaxFreeCashAssumption(pot)).toBe(
      'Gradual pro-rata: 30.0% of each DC Pension withdrawal is treated as tax-free; the remaining 70.0% is taxable.',
    );
  });
});
