/**
 * Full case export/import.
 *
 * A case file is a local-only JSON backup containing the live config,
 * Review baseline/history, and What If scenarios. It does not upload or sync
 * any financial data; it only lets the user save/restore a browser-local case.
 */

import type { PlannerConfig } from '../engine/types';
import { normalizeLoadedConfig } from './configMigration';
import { parseConfigFile, saveConfig } from './configStore';
import { loadReviewStore, saveReviewStore, type ReviewStore } from './reviewStore';
import { loadScenarios, saveScenarios, type Scenario } from './scenarioStore';

export const CASE_FILE_VERSION = 1;

const CASE_METADATA_STORAGE_KEY = 'rip_v2_case_metadata';

export interface CaseMetadata {
  case_name: string;
  case_reference: string;
  owner_label: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CaseFile {
  schema: 'rip.full_case';
  version: 1;
  exported_at: string;
  app: 'RetirementIncomePlannerV3';
  case_metadata: CaseMetadata;
  config: PlannerConfig;
  review_store: ReviewStore;
  scenarios: Scenario[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function blankCaseMetadata(): CaseMetadata {
  const now = new Date().toISOString();
  return {
    case_name: '',
    case_reference: '',
    owner_label: '',
    notes: '',
    created_at: now,
    updated_at: now,
  };
}

function normalizeCaseMetadata(raw: unknown): CaseMetadata {
  const fallback = blankCaseMetadata();
  if (!isRecord(raw)) return fallback;
  return {
    case_name: typeof raw.case_name === 'string' ? raw.case_name : '',
    case_reference: typeof raw.case_reference === 'string' ? raw.case_reference : '',
    owner_label: typeof raw.owner_label === 'string' ? raw.owner_label : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    created_at: typeof raw.created_at === 'string' ? raw.created_at : fallback.created_at,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : fallback.updated_at,
  };
}

export function loadCaseMetadata(): CaseMetadata {
  try {
    const raw = localStorage.getItem(CASE_METADATA_STORAGE_KEY);
    if (raw) return normalizeCaseMetadata(JSON.parse(raw));
  } catch {
    // Corrupted metadata — fall through to blank metadata.
  }
  return blankCaseMetadata();
}

export function saveCaseMetadata(metadata: CaseMetadata): CaseMetadata {
  const existing = loadCaseMetadata();
  const next = normalizeCaseMetadata({
    ...metadata,
    created_at: metadata.created_at || existing.created_at,
    updated_at: new Date().toISOString(),
  });
  localStorage.setItem(CASE_METADATA_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function filenameSafe(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function caseFileDownloadName(caseFile: CaseFile, exportedAt = new Date()): string {
  const caseSlug = filenameSafe(caseFile.case_metadata.case_name || caseFile.case_metadata.case_reference);
  return `rip_full_case${caseSlug ? `_${caseSlug}` : ''}_${exportedAt.toISOString().slice(0, 10)}.json`;
}

export function buildCaseFile(config: PlannerConfig): CaseFile {
  return {
    schema: 'rip.full_case',
    version: CASE_FILE_VERSION,
    exported_at: new Date().toISOString(),
    app: 'RetirementIncomePlannerV3',
    case_metadata: loadCaseMetadata(),
    config: normalizeLoadedConfig(deepClone(config)),
    review_store: deepClone(loadReviewStore()),
    scenarios: deepClone(loadScenarios()),
  };
}

export function exportCaseToFile(config: PlannerConfig): void {
  const caseFile = buildCaseFile(config);
  const json = JSON.stringify(caseFile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = caseFileDownloadName(caseFile);
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCaseFile(raw: string): CaseFile {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid case file: expected a JSON object');
  if (parsed.schema !== 'rip.full_case') throw new Error('Invalid case file: not a RIP full case export');
  if (parsed.version !== CASE_FILE_VERSION) throw new Error('Unsupported case file version');
  if (!isRecord(parsed.config)) throw new Error('Invalid case file: missing config');
  if (!isRecord(parsed.review_store)) throw new Error('Invalid case file: missing review history');
  if (!Array.isArray(parsed.scenarios)) throw new Error('Invalid case file: missing scenarios');

  const config = normalizeLoadedConfig(parsed.config);
  if (!config.personal || !config.target_income || !config.tax) {
    throw new Error('Invalid case file: config missing required sections');
  }

  const reviewStore = parsed.review_store as unknown as ReviewStore;
  const caseMetadata = normalizeCaseMetadata(parsed.case_metadata);
  const scenarios = (parsed.scenarios as unknown[]).map((scenario) => {
    if (!isRecord(scenario) || typeof scenario.name !== 'string' || !isRecord(scenario.config)) {
      throw new Error('Invalid case file: malformed scenario');
    }
    return {
      ...(scenario as unknown as Scenario),
      config: normalizeLoadedConfig(scenario.config),
    };
  });

  return {
    schema: 'rip.full_case',
    version: CASE_FILE_VERSION,
    exported_at: typeof parsed.exported_at === 'string' ? parsed.exported_at : new Date().toISOString(),
    app: 'RetirementIncomePlannerV3',
    case_metadata: caseMetadata,
    config,
    review_store: deepClone(reviewStore),
    scenarios,
  };
}

export function importCaseFile(caseFile: CaseFile): CaseFile {
  const normalized = parseCaseFile(JSON.stringify(caseFile));
  saveConfig(normalized.config);
  saveCaseMetadata(normalized.case_metadata);
  saveReviewStore(normalized.review_store);
  saveScenarios(normalized.scenarios);
  return normalized;
}

export type PlannerBackupFile =
  | { kind: 'full_case'; caseFile: CaseFile; config: PlannerConfig }
  | { kind: 'config_only'; config: PlannerConfig };

export function parsePlannerBackupFile(raw: string): PlannerBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Invalid JSON file');
  }

  if (isRecord(parsed) && parsed.schema === 'rip.full_case') {
    const caseFile = parseCaseFile(raw);
    return { kind: 'full_case', caseFile, config: caseFile.config };
  }

  return { kind: 'config_only', config: parseConfigFile(raw) };
}

export function importPlannerBackupFile(backup: PlannerBackupFile): PlannerBackupFile {
  if (backup.kind === 'full_case') {
    const caseFile = importCaseFile(backup.caseFile);
    return { kind: 'full_case', caseFile, config: caseFile.config };
  }

  saveConfig(backup.config);
  return backup;
}

export function importPlannerBackupFromFile(): Promise<PlannerBackupFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(importPlannerBackupFile(parsePlannerBackupFile(reader.result as string)));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Invalid backup file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

export function importCaseFromFile(): Promise<CaseFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(importCaseFile(parseCaseFile(reader.result as string)));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Invalid case file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}
