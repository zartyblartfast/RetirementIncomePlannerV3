import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../configStore';
import { buildCaseFile, importCaseFile, parseCaseFile } from '../caseStore';
import { addReview, lockBaseline, loadReviewStore } from '../reviewStore';
import { loadScenarios, saveScenario } from '../scenarioStore';

describe('caseStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds a full case file with config, review store, and scenarios', () => {
    lockBaseline(DEFAULT_CONFIG);
    addReview({
      date: '2032-01',
      pot_balances: { 'DC Pension': 180_000, ISA: 25_000 },
      income_since_last: { 'DC Pension': 5_000 },
      guaranteed_monthly: { 'State Pension': 1_020 },
      guaranteed_income_update_mode: 'update_current_assumption',
      strategy: 'fixed_target',
      strategy_params: {},
      notes: 'first review',
    });
    saveScenario('Downside', DEFAULT_CONFIG);

    const caseFile = buildCaseFile(DEFAULT_CONFIG);

    expect(caseFile.schema).toBe('rip.full_case');
    expect(caseFile.version).toBe(1);
    expect(caseFile.config.personal.date_of_birth).toBe(DEFAULT_CONFIG.personal.date_of_birth);
    expect(caseFile.review_store.baseline_config).not.toBeNull();
    expect(caseFile.review_store.reviews).toHaveLength(1);
    expect(caseFile.scenarios).toHaveLength(1);
  });

  it('imports a full case and replaces all local case stores', () => {
    lockBaseline(DEFAULT_CONFIG);
    addReview({
      date: '2032-02',
      pot_balances: { 'DC Pension': 175_000 },
      income_since_last: {},
      guaranteed_monthly: { 'State Pension': 1_030 },
      guaranteed_income_update_mode: 'record_only',
      strategy: 'fixed_target',
      strategy_params: {},
      notes: 'restore target',
    });
    saveScenario('Restore scenario', DEFAULT_CONFIG);
    const caseFile = buildCaseFile({
      ...DEFAULT_CONFIG,
      personal: { ...DEFAULT_CONFIG.personal, end_age: 95 },
    });

    localStorage.clear();
    importCaseFile(caseFile);

    expect(loadReviewStore().reviews[0]?.date).toBe('2032-02');
    expect(loadScenarios()[0]?.name).toBe('Restore scenario');
    const restoredConfig = JSON.parse(localStorage.getItem('rip_v2_config') ?? '{}');
    expect(restoredConfig.personal.end_age).toBe(95);
  });

  it('rejects config-only JSON as a full case file', () => {
    expect(() => parseCaseFile(JSON.stringify(DEFAULT_CONFIG))).toThrow(/not a RIP full case export/);
  });
});
