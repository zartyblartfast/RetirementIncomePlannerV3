import { describe, expect, it } from 'vitest';
import { buildConfig } from '../OnboardingWizard';

const baseData = {
  dob: '1970-01',
  retirementDate: '2035-01',
  endAge: 90,
  targetNetAnnual: 25_000,
  cpiRate: 0.025,
  hasStatePension: true,
  statePensionGross: 11_973,
  statePensionStart: '2035-01',
  hasDcPot: true,
  dcPotName: 'DC Pension',
  dcPotBalance: 100_000,
  dcGrowthRate: 0.04,
  dcFees: 0.005,
  hasIsa: true,
  isaBalance: 30_000,
  isaGrowthRate: 0.035,
};

describe('buildConfig', () => {
  it('creates one blended drawdown stage from scratch setup sources', () => {
    const cfg = buildConfig(baseData);

    expect(cfg.withdrawal_priority).toEqual(['DC Pension', 'ISA']);
    expect(cfg.drawdown_stages).toEqual([
      {
        id: 'stage_1',
        sources: [
          { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.5 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.5 },
        ],
      },
    ]);
  });

  it('does not retain stale default drawdown sources when setup excludes ISA', () => {
    const cfg = buildConfig({
      ...baseData,
      hasIsa: false,
      isaBalance: 0,
    });

    expect(cfg.withdrawal_priority).toEqual(['DC Pension']);
    expect(cfg.drawdown_stages).toEqual([
      {
        id: 'stage_1',
        sources: [
          { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 },
        ],
      },
    ]);
  });
});
