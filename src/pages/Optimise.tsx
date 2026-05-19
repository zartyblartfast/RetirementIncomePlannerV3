/**
 * Strategy Page - retirement income strategy and drawdown order analysis.
 */

import { useMemo, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { useConfig } from '../store/configStore';
import { saveScenario } from '../store/scenarioStore';
import { getStrategyDisplayName } from '../engine/strategies';
import { getKeyWindowStarts } from '../engine/optimiser';
import type { KeyWindowStarts } from '../engine/optimiser';
import { evaluateStrategyComparisonCandidates } from '../engine/strategyComparison';
import type { StrategyComparisonResult } from '../engine/strategyComparison';
import DrawdownStagesPanel from '../components/dashboard/drawdownStageSummary';
import PensionAccessEventsPanel from '../components/strategy/PensionAccessEventsPanel';

function fmt(n: number): string {
  return '\u00A3' + Math.round(n).toLocaleString('en-GB');
}

type RankingGoal = 'balanced' | 'maximise_spending' | 'preserve_capital' | 'avoid_income_gaps' | 'smooth_income' | 'minimise_tax';

type GoalSortKey =
  | 'average_annual_net_income'
  | 'minimum_annual_net_income'
  | 'years_below_reference_income'
  | 'total_gap_vs_reference_income'
  | 'worst_annual_gap_vs_reference_income'
  | 'final_flexible_capital'
  | 'total_tax'
  | 'income_volatility'
  | 'worst_annual_income_drop';

interface GoalSortSpec {
  key: GoalSortKey;
  dir: 'asc' | 'desc';
}

const RANKING_GOAL_LABELS: Record<RankingGoal, string> = {
  balanced: 'Balanced',
  maximise_spending: 'Maximise spending',
  preserve_capital: 'Preserve capital',
  avoid_income_gaps: 'Avoid income gaps',
  smooth_income: 'Smooth income',
  minimise_tax: 'Minimise tax',
};

const RANKING_GOAL_OPTIONS: RankingGoal[] = [
  'balanced',
  'maximise_spending',
  'preserve_capital',
  'avoid_income_gaps',
  'smooth_income',
  'minimise_tax',
];

const GOAL_SORTS: Record<RankingGoal, GoalSortSpec[]> = {
  balanced: [
    { key: 'years_below_reference_income', dir: 'asc' },
    { key: 'total_gap_vs_reference_income', dir: 'asc' },
    { key: 'average_annual_net_income', dir: 'desc' },
    { key: 'final_flexible_capital', dir: 'desc' },
    { key: 'total_tax', dir: 'asc' },
  ],
  maximise_spending: [
    { key: 'average_annual_net_income', dir: 'desc' },
    { key: 'minimum_annual_net_income', dir: 'desc' },
    { key: 'total_gap_vs_reference_income', dir: 'asc' },
    { key: 'final_flexible_capital', dir: 'desc' },
  ],
  preserve_capital: [
    { key: 'final_flexible_capital', dir: 'desc' },
    { key: 'years_below_reference_income', dir: 'asc' },
    { key: 'average_annual_net_income', dir: 'desc' },
  ],
  avoid_income_gaps: [
    { key: 'years_below_reference_income', dir: 'asc' },
    { key: 'total_gap_vs_reference_income', dir: 'asc' },
    { key: 'worst_annual_gap_vs_reference_income', dir: 'asc' },
    { key: 'minimum_annual_net_income', dir: 'desc' },
  ],
  smooth_income: [
    { key: 'income_volatility', dir: 'asc' },
    { key: 'worst_annual_income_drop', dir: 'asc' },
    { key: 'minimum_annual_net_income', dir: 'desc' },
    { key: 'average_annual_net_income', dir: 'desc' },
  ],
  minimise_tax: [
    { key: 'total_tax', dir: 'asc' },
    { key: 'average_annual_net_income', dir: 'desc' },
    { key: 'final_flexible_capital', dir: 'desc' },
  ],
};

function compareMetric(a: StrategyComparisonResult, b: StrategyComparisonResult, spec: GoalSortSpec): number {
  const diff = a[spec.key] - b[spec.key];
  return spec.dir === 'asc' ? diff : -diff;
}

function sortByGoal(rows: StrategyComparisonResult[], goal: RankingGoal): StrategyComparisonResult[] {
  const sorts = GOAL_SORTS[goal];
  return [...rows].sort((a, b) => {
    for (const spec of sorts) {
      const c = compareMetric(a, b, spec);
      if (c !== 0) return c;
    }
    return a.label.localeCompare(b.label);
  });
}

function formatStrategyNote(row: StrategyComparisonResult): string {
  const notes: string[] = [];
  if (row.first_depleted_source && row.first_depleted_age !== null) {
    notes.push(`${row.first_depleted_source} depleted at ${row.first_depleted_age}`);
  }
  if (row.already_active) notes.push('Current plan');
  return notes.join(' · ') || '-';
}

type WindowView = 'static' | 'worst' | 'median' | 'best';

export default function Optimise() {
  const { config, updateConfig } = useConfig();
  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const strategyName = getStrategyDisplayName(strategyId);

  const [windowView, setWindowView] = useState<WindowView>('static');
  const keyWindows = useMemo<KeyWindowStarts | null>(() => {
    try { return getKeyWindowStarts(config); } catch { return null; }
  }, [config]);

  const windowStart = useMemo(() => {
    if (!keyWindows || windowView === 'static') return undefined;
    return keyWindows[windowView as 'worst' | 'median' | 'best'].start;
  }, [keyWindows, windowView]);

  const windowLabel = useMemo(() => {
    if (!keyWindows || windowView === 'static') return 'Static growth rates';
    return keyWindows[windowView as 'worst' | 'median' | 'best'].label;
  }, [keyWindows, windowView]);

  const [rankingGoal, setRankingGoal] = useState<RankingGoal>('balanced');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [scenarioSaveMessage, setScenarioSaveMessage] = useState<string | null>(null);

  const comparisonRows = useMemo<StrategyComparisonResult[]>(() => {
    return evaluateStrategyComparisonCandidates(config, windowStart);
  }, [config, windowStart]);

  const sortedRows = useMemo(
    () => sortByGoal(comparisonRows, rankingGoal),
    [comparisonRows, rankingGoal],
  );

  const selectedCandidate = useMemo(
    () => comparisonRows.find(row => row.id === selectedCandidateId) ?? null,
    [comparisonRows, selectedCandidateId],
  );

  function scenarioDefaultName(row: StrategyComparisonResult): string {
    return `${strategyName} - ${row.label}`;
  }

  function applySelectedCandidate() {
    const selected = selectedCandidate;
    if (!selected) return;
    updateConfig(prev => ({
      ...prev,
      withdrawal_priority: selected.config.withdrawal_priority,
      drawdown_stages: selected.config.drawdown_stages,
    }));
  }

  function saveSelectedAsScenario() {
    const selected = selectedCandidate;
    if (!selected) return;
    const defaultName = scenarioDefaultName(selected);
    const name = window.prompt('Save this source pattern as a What If scenario:', defaultName)?.trim();
    if (!name) return;
    saveScenario(name, selected.config);
    setScenarioSaveMessage(`Saved to What If scenarios as “${name}”.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Retirement Income Strategy</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Edit drawdown stages, withdrawal order and planned pension-access/TFC events for the Current Plan shown on the Dashboard · Strategy: {strategyName}
        </p>
      </div>

      <DrawdownStagesPanel variant="editor" />

      <PensionAccessEventsPanel />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Strategy Impact Comparison
            <span className="ml-2 text-xs font-normal text-gray-400">
              {comparisonRows.length} representative patterns
            </span>
          </h2>
          <p className="basis-full text-xs text-gray-500">
            Compare common source-order and blending patterns. This is not a black-box optimiser; selecting a row lets you update the Current Plan strategy explicitly.
          </p>
          <div className="basis-full rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <span className="font-semibold">Applied income rule: {strategyName}.</span>{' '}
            Rows below only vary the source order/blending pattern used to fund that income rule.
          </div>
          <p className="basis-full text-xs text-gray-500">
            Income and capital are calculated by running the normal projection engine for each source pattern. Reference income is the Current Plan planning benchmark; portfolio-driven strategies such as ARVA are compared against it for adequacy, but may not be targeting it internally.
          </p>
          <p className="basis-full text-xs text-gray-500">
            Showing representative source patterns, not every possible sequencing or blend-percentage permutation. Save a selected row as a What If scenario to compare or edit it later without changing the Current Plan.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Rank by goal:
              <select
                value={rankingGoal}
                onChange={e => setRankingGoal(e.target.value as RankingGoal)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700"
              >
                {RANKING_GOAL_OPTIONS.map(goal => (
                  <option key={goal} value={goal}>{RANKING_GOAL_LABELS[goal]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Growth projection
              <select
                value={windowView}
                onChange={e => setWindowView(e.target.value as WindowView)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700"
              >
                <option value="static">Static Growth</option>
                {keyWindows && (
                  <>
                    <option value="worst">Worst ({keyWindows.worst.label})</option>
                    <option value="median">Median ({keyWindows.median.label})</option>
                    <option value="best">Best ({keyWindows.best.label})</option>
                  </>
                )}
              </select>
            </label>
            <span className="text-xs text-gray-400">{windowLabel}</span>
            {selectedCandidateId && (
              <>
                <button
                  onClick={saveSelectedAsScenario}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                  title="Save this source pattern to the What If scenario list without changing the Current Plan"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save as What If Scenario
                </button>
                <button
                  onClick={applySelectedCandidate}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Update Current Plan
                </button>
              </>
            )}
          </div>
          {scenarioSaveMessage && (
            <p className="basis-full text-xs text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              {scenarioSaveMessage} Open the What If page when you want to load, edit, or compare it.
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Rank</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Source pattern</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">Avg net income</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">Min net income</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">Years below reference</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">Total gap</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">Worst gap</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">End capital</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium whitespace-nowrap">Total tax</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const isCurrent = row.already_active;
                const isSelected = selectedCandidateId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-300'
                        : isCurrent
                          ? 'bg-amber-50/50'
                          : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedCandidateId(row.id);
                      setScenarioSaveMessage(null);
                    }}
                  >
                    <td className="py-2 px-2 text-gray-400 text-xs">#{i + 1}</td>
                    <td className="py-2 px-2 font-medium text-gray-800 min-w-[18rem]">
                      {isCurrent && <span className="text-amber-600 mr-1" title="Current strategy">★</span>}
                      {i === 0 && <span className="text-blue-600 mr-1" title="Best for selected goal">Best for selected goal</span>}
                      {row.label}
                      <div className="text-[11px] font-normal text-blue-700 mt-0.5">Income rule: {strategyName}</div>
                      <div className="text-xs font-normal text-gray-500 mt-0.5">Source rule: {row.source_rule_summary}</div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.average_annual_net_income)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.minimum_annual_net_income)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.years_below_reference_income}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.total_gap_vs_reference_income)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.worst_annual_gap_vs_reference_income)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.final_flexible_capital)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.total_tax)}</td>
                    <td className="py-2 px-2 text-xs text-gray-500 min-w-[10rem]">{formatStrategyNote(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          <span>★ = your current strategy</span>
          <span>#1 = Best for selected goal</span>
          <span>Click a row to select · then Update Current Plan</span>
        </div>
      </div>
    </div>
  );
}
