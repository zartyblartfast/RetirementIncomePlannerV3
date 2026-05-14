import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../configStore';
import { buildCaseFile, caseFileDownloadName, importCaseFile, loadCaseMetadata, parseCaseFile, saveCaseMetadata } from '../caseStore';
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
    saveCaseMetadata({
      case_name: 'Main plan',
      case_reference: 'CASE-001',
      owner_label: 'Household',
      notes: 'Export test',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    });

    const caseFile = buildCaseFile(DEFAULT_CONFIG);

    expect(caseFile.schema).toBe('rip.full_case');
    expect(caseFile.version).toBe(1);
    expect(caseFile.case_metadata.case_name).toBe('Main plan');
    expect(caseFile.case_metadata.case_reference).toBe('CASE-001');
    expect(caseFile.config.personal.date_of_birth).toBe(DEFAULT_CONFIG.personal.date_of_birth);
    expect(caseFile.review_store.baseline_config).not.toBeNull();
    expect(caseFile.review_store.reviews).toHaveLength(1);
    expect(caseFile.scenarios).toHaveLength(1);
  });

  it('normalizes drawdown stages in case config and scenario config during full-case round-trip', () => {
    saveScenario('Legacy scenario', {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'DC Pension'],
      drawdown_stages: undefined,
    });

    const caseFile = buildCaseFile({
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'DC Pension'],
      drawdown_stages: undefined,
    });

    const parsed = parseCaseFile(JSON.stringify(caseFile));

    expect(parsed.config.drawdown_stages?.map(stage => stage.id)).toEqual(['legacy_stage_1', 'legacy_stage_2']);
    expect(parsed.scenarios[0]?.config.drawdown_stages?.map(stage => stage.id)).toEqual([
      'legacy_stage_1',
      'legacy_stage_2',
    ]);
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
    saveCaseMetadata({
      case_name: 'Restore plan',
      case_reference: 'RESTORE-001',
      owner_label: 'Client A',
      notes: 'Restore metadata',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    });
    const caseFile = buildCaseFile({
      ...DEFAULT_CONFIG,
      personal: { ...DEFAULT_CONFIG.personal, end_age: 95 },
    });

    localStorage.clear();
    importCaseFile(caseFile);

    expect(loadReviewStore().reviews[0]?.date).toBe('2032-02');
    expect(loadScenarios()[0]?.name).toBe('Restore scenario');
    expect(loadCaseMetadata().case_name).toBe('Restore plan');
    expect(loadCaseMetadata().owner_label).toBe('Client A');
    const restoredConfig = JSON.parse(localStorage.getItem('rip_v2_config') ?? '{}');
    expect(restoredConfig.personal.end_age).toBe(95);
  });

  it('rejects config-only JSON as a full case file', () => {
    expect(() => parseCaseFile(JSON.stringify(DEFAULT_CONFIG))).toThrow(/not a RIP full case export/);
  });

  it('parses older full-case files without metadata using blank metadata', () => {
    const caseFile = buildCaseFile(DEFAULT_CONFIG);
    const legacy = { ...caseFile } as Record<string, unknown>;
    delete legacy.case_metadata;

    const parsed = parseCaseFile(JSON.stringify(legacy));

    expect(parsed.case_metadata.case_name).toBe('');
    expect(parsed.case_metadata.case_reference).toBe('');
  });

  it('builds case export filenames from case name or reference', () => {
    const exportedAt = new Date('2026-05-11T12:00:00.000Z');
    const namedCase = buildCaseFile(DEFAULT_CONFIG);
    namedCase.case_metadata = {
      ...namedCase.case_metadata,
      case_name: 'Main Retirement Plan / Client A',
      case_reference: 'CASE-001',
    };

    expect(caseFileDownloadName(namedCase, exportedAt)).toBe('rip_full_case_main-retirement-plan-client-a_2026-05-11.json');

    const referenceOnlyCase = buildCaseFile(DEFAULT_CONFIG);
    referenceOnlyCase.case_metadata = {
      ...referenceOnlyCase.case_metadata,
      case_name: '',
      case_reference: 'CASE-001',
    };

    expect(caseFileDownloadName(referenceOnlyCase, exportedAt)).toBe('rip_full_case_case-001_2026-05-11.json');
  });
});
