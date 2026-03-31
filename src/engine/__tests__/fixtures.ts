/**
 * Test fixtures — mirrors V1 config_default.json
 */
import type { PlannerConfig } from '../types';

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
      start_age: 68,
      end_age: null,
      taxable: true,
      values_as_of: '2025-03',
    },
    {
      name: 'BP Pension (DB)',
      gross_annual: 10052.28,
      indexation_rate: 0.03,
      start_age: 68,
      end_age: null,
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
  withdrawal_priority: [
    'Employer DC Pot',
    'Consolidated DC Pot',
    'ISA',
  ],
  tax: {
    regime: 'Isle of Man',
    personal_allowance: 14500,
    bands: [
      { name: 'Lower rate', width: 6500, rate: 0.1 },
      { name: 'Higher rate', width: null, rate: 0.2 },
    ],
    tax_cap_enabled: false,
    tax_cap_amount: 200000,
  },
};

/**
 * Simple config for isolated testing — single DC pot, no ISA,
 * single guaranteed income, fixed_target strategy.
 */
export const SIMPLE_CONFIG: PlannerConfig = {
  personal: {
    date_of_birth: '1960-01',
    retirement_date: '2028-01',
    end_age: 90,
    currency: 'GBP',
  },
  target_income: {
    net_annual: 25000,
    cpi_rate: 0.02,
  },
  guaranteed_income: [
    {
      name: 'State Pension',
      gross_annual: 12000,
      indexation_rate: 0.025,
      start_date: '2028-01',
      end_age: null,
      taxable: true,
      values_as_of: '2028-01',
    },
  ],
  dc_pots: [
    {
      name: 'Main Pot',
      starting_balance: 200000,
      growth_rate: 0.04,
      annual_fees: 0.005,
      tax_free_portion: 0.25,
      values_as_of: '2028-01',
    },
  ],
  tax_free_accounts: [],
  withdrawal_priority: ['Main Pot'],
  tax: {
    regime: 'Isle of Man',
    personal_allowance: 14500,
    bands: [
      { name: 'Lower rate', width: 6500, rate: 0.1 },
      { name: 'Higher rate', width: null, rate: 0.2 },
    ],
    tax_cap_enabled: false,
    tax_cap_amount: 200000,
  },
};
