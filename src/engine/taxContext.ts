import type { TaxConfig } from './types';
import { getTaxRulePack } from './taxRulePacks';

export type TaxContextStatus = 'rule-pack' | 'modified-rule-pack' | 'custom' | 'unknown-rule-pack';

export interface TaxContextSource {
  name: string;
  url: string;
  checkedDate: string;
}

export interface TaxContext {
  regimeLabel: string;
  rulePackId: string | null;
  taxYear: string;
  lastCheckedDate: string;
  sources: TaxContextSource[];
  knownExclusions: string[];
  status: TaxContextStatus;
  statusLabel: string;
}

const CUSTOM_KNOWN_EXCLUSIONS = [
  'No official source URL is attached to this custom tax configuration.',
  'Personal allowance taper above £100k is not modelled unless a taper is explicitly configured.',
  'Savings, dividends, National Insurance, capital gains, inheritance tax, residency, and treaty rules are not modelled.',
];

const UNKNOWN_PACK_KNOWN_EXCLUSIONS = [
  'The referenced tax rule pack is not available in this app version.',
  'Source URLs, checked date, and tax year cannot be verified for this saved tax configuration.',
];

function latestCheckedDate(sources: TaxContextSource[]): string {
  if (sources.length === 0) return 'Not recorded';
  return sources
    .map(source => source.checkedDate)
    .sort((a, b) => b.localeCompare(a))[0] ?? 'Not recorded';
}

function taxConfigMatchesRulePack(tax: TaxConfig, packTax: TaxConfig): boolean {
  const comparableTax: TaxConfig = JSON.parse(JSON.stringify(tax));
  const comparablePackTax: TaxConfig = JSON.parse(JSON.stringify(packTax));
  return JSON.stringify(comparableTax) === JSON.stringify(comparablePackTax);
}

export function deriveTaxContext(tax: TaxConfig): TaxContext {
  if (!tax.rule_pack_id) {
    return {
      regimeLabel: tax.regime || 'Custom tax configuration',
      rulePackId: null,
      taxYear: 'Not specified',
      lastCheckedDate: 'Not recorded',
      sources: [],
      knownExclusions: CUSTOM_KNOWN_EXCLUSIONS,
      status: 'custom',
      statusLabel: 'Custom/user-configured tax settings',
    };
  }

  const pack = getTaxRulePack(tax.rule_pack_id);
  if (!pack) {
    return {
      regimeLabel: tax.regime || tax.rule_pack_id,
      rulePackId: tax.rule_pack_id,
      taxYear: 'Unknown',
      lastCheckedDate: 'Not recorded',
      sources: [],
      knownExclusions: UNKNOWN_PACK_KNOWN_EXCLUSIONS,
      status: 'unknown-rule-pack',
      statusLabel: 'Unknown rule pack reference',
    };
  }

  const sources = pack.sources.map(source => ({
    name: source.name,
    url: source.url,
    checkedDate: source.checked_date,
  }));
  const isUneditedRulePack = taxConfigMatchesRulePack(tax, pack.tax_config);

  return {
    regimeLabel: pack.label,
    rulePackId: pack.id,
    taxYear: pack.tax_year,
    lastCheckedDate: latestCheckedDate(sources),
    sources,
    knownExclusions: pack.known_exclusions,
    status: isUneditedRulePack ? 'rule-pack' : 'modified-rule-pack',
    statusLabel: isUneditedRulePack
      ? 'Rule pack applied'
      : 'Rule pack selected; calculation values edited',
  };
}
