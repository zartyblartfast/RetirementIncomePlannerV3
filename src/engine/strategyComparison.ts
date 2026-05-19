import { runProjection } from './projection';
import { runProjectionForWindow } from './backtest';
import { STRATEGIES } from './strategies';
import type { DrawdownStageConfig, DrawdownStageSourceConfig, PlannerConfig, YearRow } from './types';

export interface StrategyComparisonCandidate {
  id: string;
  label: string;
  source_rule_summary: string;
  already_active: boolean;
  config: PlannerConfig;
}

export interface StrategyComparisonResult {
  id: string;
  label: string;
  source_rule_summary: string;
  already_active: boolean;
  config: PlannerConfig;
  sustainable: boolean;
  first_shortfall_age: number | null;
  remaining_capital: number;
  final_flexible_capital: number;
  total_tax: number;
  average_annual_net_income: number;
  minimum_annual_net_income: number;
  years_below_reference_income: number;
  total_gap_vs_reference_income: number;
  worst_annual_gap_vs_reference_income: number;
  income_volatility: number;
  worst_annual_income_drop: number;
  first_depleted_source: string | null;
  first_depleted_age: number | null;
  income_shortfall_years: number;
}

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function sourceKeyPart(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'source';
}

function sourceForName(cfg: PlannerConfig, sourceName: string, targetShare: number): DrawdownStageSourceConfig | null {
  if ((cfg.dc_pots ?? []).some(pot => pot.name === sourceName)) {
    return { source_type: 'dc_pot', source_name: sourceName, target_share: targetShare };
  }
  if ((cfg.tax_free_accounts ?? []).some(account => account.name === sourceName)) {
    return { source_type: 'tax_free_account', source_name: sourceName, target_share: targetShare };
  }
  return null;
}

function drawableSourceNames(cfg: PlannerConfig): string[] {
  const names = [
    ...(cfg.dc_pots ?? []).map(pot => pot.name),
    ...(cfg.tax_free_accounts ?? []).map(account => account.name),
  ];
  const priority = cfg.withdrawal_priority ?? [];
  return [
    ...priority.filter(name => names.includes(name)),
    ...names.filter(name => !priority.includes(name)),
  ];
}

function stageLabel(stage: DrawdownStageConfig, index: number): string {
  return stage.name?.trim() || `Stage ${index + 1}`;
}

function formatStageSummary(stage: DrawdownStageConfig, index: number): string {
  const sourceSummary = stage.sources
    .map(source => `${source.source_name} ${(source.target_share * 100).toFixed(1)}%`)
    .join(' + ');
  return `${stageLabel(stage, index)} — ${sourceSummary || 'No sources configured'}`;
}

function formatStagesSummary(stages: DrawdownStageConfig[]): string {
  return stages.filter(stage => stage.sources.length > 0).map(formatStageSummary).join('; ');
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function minimum(values: number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

function maximum(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function worstYearOnYearDrop(values: number[]): number {
  let worstDrop = 0;
  for (let i = 1; i < values.length; i += 1) {
    const drop = values[i - 1]! - values[i]!;
    if (drop > worstDrop) worstDrop = drop;
  }
  return worstDrop;
}

function initialReferenceIncome(cfg: PlannerConfig): number {
  const strategyId = cfg.drawdown_strategy ?? 'fixed_target';
  const params = cfg.drawdown_strategy_params ?? {};
  if (strategyId === 'fixed_target') {
    return params.net_annual ?? cfg.target_income.net_annual;
  }
  if (strategyId === 'vanguard_dynamic' || strategyId === 'guyton_klinger') {
    return params.initial_target ?? cfg.target_income.net_annual;
  }
  return cfg.target_income.net_annual;
}

function planningBenchmarkReferenceForYear(cfg: PlannerConfig, year: YearRow, yearIndex: number): number {
  if (yearIndex === 0) return initialReferenceIncome(cfg);
  const cpi = cfg.cpi_rate_schedule?.[year.age] ?? cfg.target_income.cpi_rate;
  return initialReferenceIncome(cfg) * ((1 + cpi) ** yearIndex);
}

function annualReferenceIncome(cfg: PlannerConfig, year: YearRow, yearIndex: number): number {
  const strategyId = cfg.drawdown_strategy ?? 'fixed_target';
  const isPortfolioDriven = STRATEGIES[strategyId]?.portfolio_driven === true;
  return isPortfolioDriven ? planningBenchmarkReferenceForYear(cfg, year, yearIndex) : year.target_net;
}

function annualReferenceGap(cfg: PlannerConfig, year: YearRow, yearIndex: number): number {
  return Math.max(0, annualReferenceIncome(cfg, year, yearIndex) - year.net_income_achieved);
}

function configWithStages(base: PlannerConfig, stages: DrawdownStageConfig[]): PlannerConfig {
  const next = cloneConfig(base);
  next.drawdown_stages = stages;
  next.withdrawal_priority = stages.flatMap(stage => stage.sources.map(source => source.source_name));
  return next;
}

function sequentialStagesForOrder(cfg: PlannerConfig, order: string[], idPrefix = 'strategy_seq'): DrawdownStageConfig[] {
  return order.flatMap((name, index) => {
    const source = sourceForName(cfg, name, 1);
    if (!source) return [];
    return [{ id: `${idPrefix}_${index + 1}`, sources: [source] }];
  });
}

function equalBlendStage(cfg: PlannerConfig, names: string[], id: string, name?: string): DrawdownStageConfig | null {
  if (names.length === 0) return null;
  const share = 1 / names.length;
  const sources = names
    .map(sourceName => sourceForName(cfg, sourceName, share))
    .filter((source): source is DrawdownStageSourceConfig => source !== null);
  if (sources.length === 0) return null;
  return { id, ...(name ? { name } : {}), sources };
}

function candidateFromStages(
  base: PlannerConfig,
  id: string,
  label: string,
  stages: DrawdownStageConfig[],
  alreadyActive = false,
): StrategyComparisonCandidate {
  const config = configWithStages(base, stages);
  return {
    id,
    label,
    source_rule_summary: formatStagesSummary(stages),
    already_active: alreadyActive,
    config,
  };
}

function dcNames(cfg: PlannerConfig): string[] {
  return (cfg.dc_pots ?? []).map(pot => pot.name);
}

function taxFreeNames(cfg: PlannerConfig): string[] {
  return (cfg.tax_free_accounts ?? []).map(account => account.name);
}

export function generateStrategyComparisonCandidates(cfg: PlannerConfig): StrategyComparisonCandidate[] {
  const base = cloneConfig(cfg);
  const currentStages = Array.isArray(base.drawdown_stages) ? base.drawdown_stages : sequentialStagesForOrder(base, drawableSourceNames(base));
  const candidates: StrategyComparisonCandidate[] = [
    candidateFromStages(base, 'current_strategy', 'Current strategy', currentStages, true),
  ];

  const sourceNames = drawableSourceNames(base);
  if (sourceNames.length > 0) {
    candidates.push(candidateFromStages(
      base,
      `sequential_${sourceNames.map(sourceKeyPart).join('_')}`,
      `Sequential: ${sourceNames.join(' then ')}`,
      sequentialStagesForOrder(base, sourceNames),
    ));
  }

  if (sourceNames.length > 1 && sourceNames.length <= 3) {
    const reversed = [...sourceNames].reverse();
    candidates.push(candidateFromStages(
      base,
      `sequential_${reversed.map(sourceKeyPart).join('_')}`,
      `Sequential: ${reversed.join(' then ')}`,
      sequentialStagesForOrder(base, reversed),
    ));
  }

  const dcs = dcNames(base);
  const taxFree = taxFreeNames(base);
  if (dcs.length > 1 && taxFree.length > 0) {
    const dcBlend = equalBlendStage(base, dcs, 'blend_dc_first', 'Blend DC pensions first');
    const taxFreeStages = sequentialStagesForOrder(base, taxFree, 'tax_free_after_dc_blend');
    if (dcBlend) {
      candidates.push(candidateFromStages(
        base,
        'blend_dc_first_then_tax_free',
        'Blend DC pensions first, then tax-free accounts',
        [dcBlend, ...taxFreeStages],
      ));
    }

    const taxFreeFirstStages = sequentialStagesForOrder(base, taxFree, 'tax_free_first');
    if (taxFreeFirstStages[0]) {
      taxFreeFirstStages[0] = { ...taxFreeFirstStages[0], name: 'Tax-free accounts first' };
    }
    const laterDcBlend = equalBlendStage(base, dcs, 'blend_dc_second');
    if (laterDcBlend) {
      candidates.push(candidateFromStages(
        base,
        'tax_free_first_then_blend_dc',
        'Tax-free accounts first, then blend DC pensions',
        [...taxFreeFirstStages, laterDcBlend],
      ));
    }
  }

  if (sourceNames.length > 1) {
    const allBlend = equalBlendStage(base, sourceNames, 'equal_blend_all_sources', 'Equal blend all flexible sources');
    if (allBlend) {
      candidates.push(candidateFromStages(
        base,
        'equal_blend_all_sources',
        'Equal blend all flexible sources',
        [allBlend],
      ));
    }
  }

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export function evaluateStrategyComparisonCandidate(
  candidate: StrategyComparisonCandidate,
  windowStart?: number,
): StrategyComparisonResult {
  const projection = windowStart === undefined
    ? runProjection(candidate.config)
    : runProjectionForWindow(candidate.config, windowStart);
  const firstDepletion = projection.summary.depletion_events[0];
  const annualNetIncome = projection.years.map(year => year.net_income_achieved);
  const referenceGaps = projection.years.map((year, yearIndex) => annualReferenceGap(candidate.config, year, yearIndex));
  const yearsBelowReferenceIncome = projection.years.filter((year, yearIndex) => year.net_income_achieved < annualReferenceIncome(candidate.config, year, yearIndex) - 1).length;
  const finalFlexibleCapital = Math.round(projection.summary.remaining_capital);
  return {
    id: candidate.id,
    label: candidate.label,
    source_rule_summary: candidate.source_rule_summary,
    already_active: candidate.already_active,
    config: candidate.config,
    sustainable: projection.summary.sustainable,
    first_shortfall_age: projection.summary.first_shortfall_age,
    remaining_capital: finalFlexibleCapital,
    final_flexible_capital: finalFlexibleCapital,
    total_tax: Math.round(projection.summary.total_tax_paid),
    average_annual_net_income: Math.round(average(annualNetIncome)),
    minimum_annual_net_income: Math.round(minimum(annualNetIncome)),
    years_below_reference_income: yearsBelowReferenceIncome,
    total_gap_vs_reference_income: Math.round(sum(referenceGaps)),
    worst_annual_gap_vs_reference_income: Math.round(maximum(referenceGaps)),
    income_volatility: Math.round(standardDeviation(annualNetIncome)),
    worst_annual_income_drop: Math.round(worstYearOnYearDrop(annualNetIncome)),
    first_depleted_source: firstDepletion?.pot ?? null,
    first_depleted_age: firstDepletion?.age ?? null,
    income_shortfall_years: projection.years.filter(year => year.shortfall).length,
  };
}

export function evaluateStrategyComparisonCandidates(
  cfg: PlannerConfig,
  windowStart?: number,
): StrategyComparisonResult[] {
  return generateStrategyComparisonCandidates(cfg).map(candidate => evaluateStrategyComparisonCandidate(candidate, windowStart));
}
