import { describe, it, expect } from 'vitest';
import { runSanityChecks } from '../sanityChecks';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';

describe('runSanityChecks', () => {
  const result = runProjection(DEFAULT_CONFIG);

  it('returns a SanityReport with checks', () => {
    const report = runSanityChecks(result);
    expect(report).toHaveProperty('checks');
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it('all checks pass on default config', () => {
    const report = runSanityChecks(result);
    for (const check of report.checks) {
      expect(check.status).not.toBe('fail');
    }
  });

  it('income_identity check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'income_identity');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('tax_monotonic check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'tax_monotonic');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('capital_non_negative check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'capital_non_negative');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('pot_pnl_identity check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'pot_pnl_identity');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('tax_bands_sum check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'tax_bands_sum');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('shortfall_consistency check passes', () => {
    const report = runSanityChecks(result);
    const check = report.checks.find(c => c.id === 'shortfall_consistency');
    expect(check).toBeDefined();
    expect(check!.status).toBe('pass');
  });

  it('produces a human-readable summary string', () => {
    const report = runSanityChecks(result);
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
  });

  it('passCount + warnCount + failCount equals checks.length', () => {
    const report = runSanityChecks(result);
    expect(report.passCount + report.warnCount + report.failCount).toBe(report.checks.length);
  });

  it('handles empty projection gracefully', () => {
    const emptyResult = { years: [], summary: result.summary, warnings: [] };
    const report = runSanityChecks(emptyResult);
    expect(report.checks.length).toBe(0);
    expect(report.summary).toBeTruthy();
  });
});
