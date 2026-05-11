/**
 * Full case export/import.
 *
 * A case file is a local-only JSON backup containing the live config,
 * Review baseline/history, and What If scenarios. It does not upload or sync
 * any financial data; it only lets the user save/restore a browser-local case.
 */

import type { PlannerConfig } from '../engine/types';
import { normalizeLoadedConfig } from './configMigration';
import { saveConfig } from './configStore';
import { loadReviewStore, saveReviewStore, type ReviewStore } from './reviewStore';
import { loadScenarios, saveScenarios, type Scenario } from './scenarioStore';

export const CASE_FILE_VERSION = 1;

export interface CaseFile {
  schema: 'rip.full_case';
  version: 1;
  exported_at: string;
  app: 'RetirementIncomePlannerV3';
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

export function buildCaseFile(config: PlannerConfig): CaseFile {
  return {
    schema: 'rip.full_case',
    version: CASE_FILE_VERSION,
    exported_at: new Date().toISOString(),
    app: 'RetirementIncomePlannerV3',
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
  a.download = `rip_full_case_${new Date().toISOString().slice(0, 10)}.json`;
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
    config,
    review_store: deepClone(reviewStore),
    scenarios,
  };
}

export function importCaseFile(caseFile: CaseFile): CaseFile {
  const normalized = parseCaseFile(JSON.stringify(caseFile));
  saveConfig(normalized.config);
  saveReviewStore(normalized.review_store);
  saveScenarios(normalized.scenarios);
  return normalized;
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
