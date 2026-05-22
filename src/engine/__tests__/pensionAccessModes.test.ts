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

  it('defaults phased crystallisation and UFPLS metadata to annual cadence', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dc_pots[0]!.pension_access = {
      category: 'explicit_access_route',
      event_type: 'pcls_crystallisation',
      timing_pattern: 'phased',
    };

    const normalized = normalizeConfigPensionAccessModes(cfg);

    expect(normalized.dc_pots[0]!.pension_access).toEqual({
      category: 'explicit_access_route',
      event_type: 'pcls_crystallisation',
      timing_pattern: 'phased',
      cadence: 'annual',
    });
  });

  it('preserves explicitly configured non-annual cadences for later adviser-led enhancement paths', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dc_pots[0]!.pension_access = {
      category: 'explicit_access_route',
      event_type: 'ufpls',
      timing_pattern: 'phased',
      cadence: 'quarterly',
    };

    const normalized = normalizeConfigPensionAccessModes(cfg);

    expect(normalized.dc_pots[0]!.pension_access).toEqual({
      category: 'explicit_access_route',
      event_type: 'ufpls',
      timing_pattern: 'phased',
      cadence: 'quarterly',
    });
  });

  it('accepts explicit ledger-aware taxable FAD ordinary-withdrawal mode as pot-level metadata', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dc_pots[0]!.pension_access = {
      category: 'explicit_ledger_aware',
      route: 'taxable_flexi_access_drawdown',
    };

    const normalized = normalizeConfigPensionAccessModes(cfg);
    const issues = validatePensionAccessModes(normalized);

    expect(normalized.dc_pots[0]!.pension_access).toEqual({
      category: 'explicit_ledger_aware',
      route: 'taxable_flexi_access_drawdown',
      cadence: 'monthly',
    });
    expect(issues).toEqual([]);
  });

  it('does not auto-crystallise or fall back to pro-rata when ledger-aware mode has no crystallised balance', () => {
    const ledgerAwareCfg = cloneConfig(DEFAULT_CONFIG);
    ledgerAwareCfg.dc_pots[0]!.pension_access = {
      category: 'explicit_ledger_aware',
      route: 'taxable_flexi_access_drawdown',
    };

    const ledgerAwareProjection = runProjection(normalizeConfigPensionAccessModes(ledgerAwareCfg));
    const firstYear = ledgerAwareProjection.years[0]!;
    const ledger = ledgerAwareProjection.pension_ledger_states?.find(state => state.pot_ref === 'DC Pension')!;

    expect(firstYear.dc_withdrawal_gross).toBe(0);
    expect(firstYear.dc_tax_free_portion).toBe(0);
    expect(firstYear.withdrawal_detail['DC Pension']).toBeUndefined();
    expect(firstYear.withdrawal_detail['ISA']).toBeGreaterThan(0);
    expect(ledger.crystallised_drawdown_balance).toBe(0);
    expect(ledger.taxable_drawdown_taken).toBe(0);
    expect(ledger.mpaa_triggered).toBe(false);
  });

  it('rejects malformed explicit ledger-aware routes rather than widening the supported mode', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dc_pots[0]!.pension_access = {
      category: 'explicit_ledger_aware',
      route: 'ufpls',
    } as never;

    const issues = validatePensionAccessModes(cfg);

    expect(issues).toEqual([
      {
        code: 'invalid_pension_access_mode',
        pot_name: 'DC Pension',
        message: 'DC Pension uses an unsupported pension access mode.',
      },
    ]);
  });

  it('describes simplified pro-rata as an approximation rather than a legal access route', () => {
    const cfg = normalizeConfigPensionAccessModes(cloneConfig(DEFAULT_CONFIG));

    expect(describePensionAccessMode(cfg.dc_pots[0]!)).toBe(
      'Simplified pro-rata pension withdrawals: this is a compatibility approximation, not a formal UFPLS or phased crystallisation ledger. Ordinary withdrawals continue to use the pot tax-free percentage until explicit pension-access routes are implemented.',
    );
  });

  it('describes explicit ledger-aware ordinary FAD as guarded future projection metadata', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dc_pots[0]!.pension_access = {
      category: 'explicit_ledger_aware',
      route: 'taxable_flexi_access_drawdown',
    };

    expect(describePensionAccessMode(cfg.dc_pots[0]!)).toBe(
      'Ledger-aware flexi-access drawdown: ordinary withdrawals from this pot are configured to use crystallised drawdown as taxable pension income once projection support is enabled. Create explicit PCLS/crystallisation events first; the model will not auto-crystallise or fall back to pro-rata treatment.',
    );
  });
});
