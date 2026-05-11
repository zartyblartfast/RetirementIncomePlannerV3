import type { TaxConfig } from './types';

export interface TaxRulePackSource {
  name: string;
  url: string;
  checked_date: string;
}

export interface TaxRulePack {
  id: string;
  label: string;
  jurisdiction: string;
  tax_year: string;
  tax_module_id: string;
  currency: string;
  sources: TaxRulePackSource[];
  tax_config: TaxConfig;
  income_categories: Record<string, 'ordinary_income' | 'tax_free'>;
  known_exclusions: string[];
}

export const TAX_RULE_PACKS: TaxRulePack[] = [
  {
    id: 'GB-EWNI-2026-27',
    label: 'UK England/Wales/NI 2026-27',
    jurisdiction: 'GB-EWNI',
    tax_year: '2026-27',
    tax_module_id: 'simple-banded',
    currency: 'GBP',
    sources: [
      {
        name: 'GOV.UK Income Tax rates and Personal Allowances',
        url: 'https://www.gov.uk/income-tax-rates',
        checked_date: '2026-05-05',
      },
      {
        name: 'HMRC Income Tax rates and allowances for current and previous tax years',
        url: 'https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past',
        checked_date: '2026-05-05',
      },
    ],
    tax_config: {
      regime: 'UK England/Wales/NI 2026-27',
      tax_module_id: 'simple-banded',
      rule_pack_id: 'GB-EWNI-2026-27',
      personal_allowance: 12_570,
      personal_allowance_taper: {
        starts_at: 100_000,
        rate: 0.5,
        minimum_allowance: 0,
      },
      bands: [
        { name: 'Basic rate', width: 37_700, rate: 0.20 },
        { name: 'Higher rate', width: 87_440, rate: 0.40 },
        { name: 'Additional rate', width: null, rate: 0.45 },
      ],
      tax_cap_enabled: false,
      tax_cap_amount: 200_000,
    },
    income_categories: {
      state_pension: 'ordinary_income',
      defined_benefit_pension: 'ordinary_income',
      dc_pension_drawdown: 'ordinary_income',
      isa_withdrawal: 'tax_free',
    },
    known_exclusions: [
      'Savings and dividend tax rules are not modelled.',
      'National Insurance, capital gains, inheritance tax, residency, and treaty rules are not modelled.',
      'Marriage Allowance, Blind Person Allowance, and age-related allowances are not modelled.',
    ],
  },
  {
    id: 'GB-SCT-2026-27',
    label: 'UK Scotland 2026-27',
    jurisdiction: 'GB-SCT',
    tax_year: '2026-27',
    tax_module_id: 'simple-banded',
    currency: 'GBP',
    sources: [
      {
        name: 'GOV.UK Income Tax rates and allowances for current and previous tax years',
        url: 'https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past',
        checked_date: '2026-05-05',
      },
      {
        name: 'Scottish Government Income Tax rates and bands 2026 to 2027',
        url: 'https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/',
        checked_date: '2026-05-05',
      },
    ],
    tax_config: {
      regime: 'UK Scotland 2026-27',
      tax_module_id: 'simple-banded',
      rule_pack_id: 'GB-SCT-2026-27',
      personal_allowance: 12_570,
      personal_allowance_taper: {
        starts_at: 100_000,
        rate: 0.5,
        minimum_allowance: 0,
      },
      bands: [
        { name: 'Starter rate', width: 3_967, rate: 0.19 },
        { name: 'Basic rate', width: 12_989, rate: 0.20 },
        { name: 'Intermediate rate', width: 14_136, rate: 0.21 },
        { name: 'Higher rate', width: 31_338, rate: 0.42 },
        { name: 'Advanced rate', width: 62_710, rate: 0.45 },
        { name: 'Top rate', width: null, rate: 0.48 },
      ],
      tax_cap_enabled: false,
      tax_cap_amount: 200_000,
    },
    income_categories: {
      state_pension: 'ordinary_income',
      defined_benefit_pension: 'ordinary_income',
      dc_pension_drawdown: 'ordinary_income',
      isa_withdrawal: 'tax_free',
    },
    known_exclusions: [
      'Savings and dividend tax rules use UK rather than Scottish rates and are not modelled.',
      'National Insurance, capital gains, inheritance tax, residency, and treaty rules are not modelled.',
      'Marriage Allowance, Blind Person Allowance, and age-related allowances are not modelled.',
    ],
  },
  {
    id: 'IM-2026-27',
    label: 'Isle of Man 2026-27',
    jurisdiction: 'IM',
    tax_year: '2026-27',
    tax_module_id: 'simple-banded',
    currency: 'IMP',
    sources: [
      {
        name: 'Isle of Man Government Income Tax Practice Notes',
        url: 'https://www.gov.im/categories/tax-vat-and-your-money/income-tax-and-national-insurance/tax-practitioners-and-technical-information/practice-notes/',
        checked_date: '2026-05-05',
      },
      {
        name: 'PwC Worldwide Tax Summaries - Isle of Man Individual taxes',
        url: 'https://taxsummaries.pwc.com/isle-of-man/individual/taxes-on-personal-income',
        checked_date: '2026-05-05',
      },
    ],
    tax_config: {
      regime: 'Isle of Man 2026-27',
      tax_module_id: 'simple-banded',
      rule_pack_id: 'IM-2026-27',
      personal_allowance: 17_000,
      personal_allowance_taper: {
        starts_at: 100_000,
        rate: 0.5,
        minimum_allowance: 0,
      },
      bands: [
        { name: 'Standard rate', width: 6_500, rate: 0.10 },
        { name: 'Higher rate', width: null, rate: 0.21 },
      ],
      tax_cap_enabled: false,
      tax_cap_amount: 220_000,
    },
    income_categories: {
      state_pension: 'ordinary_income',
      defined_benefit_pension: 'ordinary_income',
      dc_pension_drawdown: 'ordinary_income',
      isa_withdrawal: 'tax_free',
    },
    known_exclusions: [
      'Joint assessment and married/civil-partner allowance rules are not modelled.',
      'The Isle of Man tax cap is recorded but not enabled automatically because it requires an election and broader planning context.',
      'National Insurance, capital gains, inheritance tax, residency, and treaty rules are not modelled.',
      'Savings and dividend-specific treatment is not modelled separately from ordinary income.',
    ],
  },
];

export function getTaxRulePack(id: string | undefined): TaxRulePack | undefined {
  return TAX_RULE_PACKS.find(pack => pack.id === id);
}

export function taxConfigFromRulePack(id: string): TaxConfig {
  const pack = getTaxRulePack(id);
  if (!pack) {
    throw new Error(`Unknown tax rule pack: ${id}`);
  }
  return JSON.parse(JSON.stringify(pack.tax_config)) as TaxConfig;
}
