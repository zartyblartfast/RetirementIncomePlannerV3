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
//  Default config (same as V1 config_default.json)
// ------------------------------------------------------------------ //

export const DEFAULT_CONFIG: PlannerConfig = {
  personal: {
    date_of_birth: '1958-07',
    retirement_date: '2027-04',
    retirement_age: 68,
    end_age: 90,
    currency: 'GBP',
  },
  target_income: {
    net_annual: 30000,
    cpi_rate: 0.03,
  },
  guaranteed_income: [
    {
      name: 'UK State Pension',
      gross_annual: 13680,
      indexation_rate: 0.035,
      start_date: '2027-04',
      end_date: null,
      taxable: true,
      values_as_of: '2025-03',
    },
    {
      name: 'BP Pension (DB)',
      gross_annual: 10052.28,
      indexation_rate: 0.03,
      start_date: '2027-04',
      end_date: null,
      taxable: true,
      values_as_of: '2025-03',
    },
  ],
  dc_pots: [
    {
      name: 'Consolidated DC Pot',
      starting_balance: 180000,
      growth_rate: 0.04,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2025-03',
    },
    {
      name: 'Employer DC Pot',
      starting_balance: 95000,
      growth_rate: 0.04,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2025-03',
    },
  ],
  tax_free_accounts: [
    {
      name: 'ISA',
      starting_balance: 20000,
      growth_rate: 0.035,
      values_as_of: '2025-03',
    },
  ],
  withdrawal_priority: ['Employer DC Pot', 'Consolidated DC Pot', 'ISA'],
  tax: {
    regime: 'Custom',
    personal_allowance: 14500,
    bands: [
      { name: 'Lower rate', width: 6500, rate: 0.1 },
      { name: 'Higher rate', width: null, rate: 0.2 },
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

export function saveConfig(cfg: PlannerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function resetConfig(): PlannerConfig {
  localStorage.removeItem(STORAGE_KEY);
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
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
