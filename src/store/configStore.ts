/**
 * Config store — localStorage-backed React context for PlannerConfig.
 *
 * Provides a global config state that persists to the browser.
 * Components read config via useConfig() and update via setConfig().
 */

import { createContext, useContext } from 'react';
import type { PlannerConfig } from '../engine/types';

const STORAGE_KEY = 'rip_v2_config';

// ------------------------------------------------------------------ //
//  Default config — generic example for new users
// ------------------------------------------------------------------ //

export const DEFAULT_CONFIG: PlannerConfig = {
  personal: {
    date_of_birth: '1965-01',
    retirement_date: '2032-01',
    retirement_age: 67,
    end_age: 90,
    currency: 'GBP',
  },
  target_income: {
    net_annual: 25000,
    cpi_rate: 0.025,
  },
  guaranteed_income: [
    {
      name: 'State Pension',
      gross_annual: 11973,
      indexation_rate: 0.025,
      start_date: '2032-01',
      end_date: null,
      taxable: true,
      values_as_of: '2026-04',
    },
  ],
  dc_pots: [
    {
      name: 'DC Pension',
      starting_balance: 200000,
      growth_rate: 0.04,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2026-04',
    },
  ],
  tax_free_accounts: [
    {
      name: 'ISA',
      starting_balance: 30000,
      growth_rate: 0.035,
      values_as_of: '2026-04',
    },
  ],
  withdrawal_priority: ['DC Pension', 'ISA'],
  tax: {
    regime: 'Custom',
    personal_allowance: 12570,
    bands: [
      { name: 'Basic rate', width: 37700, rate: 0.2 },
      { name: 'Higher rate', width: null, rate: 0.4 },
    ],
    tax_cap_enabled: false,
    tax_cap_amount: 200000,
  },
};

// ------------------------------------------------------------------ //
//  Load / save
// ------------------------------------------------------------------ //

export function loadConfig(): PlannerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as PlannerConfig;
    }
  } catch {
    // Corrupted data — fall through to default
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function hasStoredConfig(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function saveConfig(cfg: PlannerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function resetConfig(): PlannerConfig {
  localStorage.removeItem(STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// ------------------------------------------------------------------ //
//  File-based export / import
// ------------------------------------------------------------------ //

export function exportConfigToFile(cfg: PlannerConfig): void {
  const json = JSON.stringify(cfg, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rip_v2_config_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importConfigFromFile(): Promise<PlannerConfig> {
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
          const cfg = JSON.parse(reader.result as string) as PlannerConfig;
          // Basic validation: check required top-level keys
          if (!cfg.personal || !cfg.target_income || !cfg.tax) {
            reject(new Error('Invalid config file: missing required sections'));
            return;
          }
          resolve(cfg);
        } catch {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

// ------------------------------------------------------------------ //
//  React context
// ------------------------------------------------------------------ //

export interface ConfigContextValue {
  config: PlannerConfig;
  setConfig: (cfg: PlannerConfig) => void;
  updateConfig: (updater: (prev: PlannerConfig) => PlannerConfig) => void;
  resetToDefault: () => void;
}

export const ConfigContext = createContext<ConfigContextValue | null>(null);

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}
