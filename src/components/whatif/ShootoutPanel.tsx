/**
 * ShootoutPanel — Strategy Shootout comparison.
 *
 * Runs all strategies through the backtest engine using the current
 * sandbox config, then displays a comparison table ranking each strategy
 * on survival rate, income stability, cumulative income, and capital.
 */

import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { PlannerConfig } from '../../engine/types';
import { STRATEGIES, STRATEGY_IDS, getStrategyDisplayName } from '../../engine/strategies';
import { normalizeConfig } from '../../engine/strategies';
import { runBacktest, extractStressTest } from '../../engine/backtest';
import type { StressTestResult } from '../../engine/backtest';

interface Props {
  config: PlannerConfig;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function pct(n: number): string {
  return Math.round(n * 100) + '%';
}

type SortGoal = 'none' | 'reliable_income' | 'preserve_capital' | 'maximise_spending';

interface StrategyRow {
  id: string;
  name: string;
  stress: StressTestResult;
  totalIncomeMedian: number;
  score: number; // for sorting
}

export default function ShootoutPanel({ config }: Props) {
  const [sortGoal, setSortGoal] = useState<SortGoal>('none');

  const rows = useMemo<StrategyRow[]>(() => {
    const results: StrategyRow[] = [];

    for (const sid of STRATEGY_IDS) {
      // Build config for this strategy with defaults
      const stratDef = STRATEGIES[sid]!;
      const params: Record<string, number> = {};
      for (const p of stratDef.params) params[p.key] = p.default;

      // Seed income-related defaults from current config
      if (sid === 'fixed_target') {
        params.net_annual = config.target_income.net_annual;
      } else if (sid === 'vanguard_dynamic' || sid === 'guyton_klinger') {
        params.initial_target = config.target_income.net_annual;
      }
      if (sid === 'arva' || sid === 'arva_guardrails') {
        params.target_end_age = config.personal.end_age;
      }

      const cfgCopy: PlannerConfig = JSON.parse(JSON.stringify(config));
      cfgCopy.drawdown_strategy = sid;
      cfgCopy.drawdown_strategy_params = params;

      // Normalize to apply strategy defaults
      const normalized = normalizeConfig(cfgCopy);

      const bt = runBacktest(normalized);
      const stress = extractStressTest(bt);
      if (!stress) continue;

      results.push({
        id: sid,
        name: getStrategyDisplayName(sid),
        stress,
        totalIncomeMedian: stress.cumulative_income.median,
        score: 0,
      });
    }

    return results;
  }, [config]);

  // Apply sorting
  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    if (sortGoal === 'reliable_income') {
      sorted.sort((a, b) => {
        // Primary: median income ratio desc, Secondary: survival rate desc
        const diff = b.stress.income_stability.median_income_ratio - a.stress.income_stability.median_income_ratio;
        return diff !== 0 ? diff : b.stress.sustainability.rate - a.stress.sustainability.rate;
      });
    } else if (sortGoal === 'preserve_capital') {
      sorted.sort((a, b) => {
        // Primary: median final capital desc
        const aCap = a.stress.percentile_trajectories.p50?.[a.stress.ages.length - 1]?.total_capital ?? 0;
        const bCap = b.stress.percentile_trajectories.p50?.[b.stress.ages.length - 1]?.total_capital ?? 0;
        return bCap - aCap;
      });
    } else if (sortGoal === 'maximise_spending') {
      sorted.sort((a, b) => b.totalIncomeMedian - a.totalIncomeMedian);
    }
    return sorted;
  }, [rows, sortGoal]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">No strategies could be tested with historical data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-cyan-500" />
          Strategy Shootout
        </h2>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Rank by goal:</label>
          <select
            value={sortGoal}
            onChange={e => setSortGoal(e.target.value as SortGoal)}
            className="text-sm rounded border-gray-300 py-0.5 px-2"
          >
            <option value="none">— No sort —</option>
            <option value="reliable_income">Reliable Income</option>
            <option value="preserve_capital">Preserve Capital</option>
            <option value="maximise_spending">Maximise Spending</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" style={{ whiteSpace: 'nowrap' }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-600 align-middle">Strategy</th>
                <th rowSpan={2} className="px-3 py-2 text-center font-medium text-gray-600 align-middle" title="% of historical periods where capital lasted to end age">Survival</th>
                <th colSpan={3} className="px-3 py-1 text-center font-medium text-cyan-700 border-b-2 border-cyan-400 bg-cyan-50/50">Income (% of target)</th>
                <th colSpan={3} className="px-3 py-1 text-center font-medium text-purple-700 border-b-2 border-purple-400 bg-purple-50/50">Cumulative Income</th>
                <th colSpan={3} className="px-3 py-1 text-center font-medium text-amber-700 border-b-2 border-amber-400 bg-amber-50/50">Capital at End Age</th>
                <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-600 align-middle" title="The historical period that performed worst">Worst Period</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-1 text-center text-cyan-600 bg-cyan-50/50">Best</th>
                <th className="px-2 py-1 text-center text-cyan-600 bg-cyan-50/50">Med</th>
                <th className="px-2 py-1 text-center text-cyan-600 bg-cyan-50/50">Worst</th>
                <th className="px-2 py-1 text-right text-purple-600 bg-purple-50/50">Best</th>
                <th className="px-2 py-1 text-right text-purple-600 bg-purple-50/50">Med</th>
                <th className="px-2 py-1 text-right text-purple-600 bg-purple-50/50">Worst</th>
                <th className="px-2 py-1 text-right text-amber-600 bg-amber-50/50">Best</th>
                <th className="px-2 py-1 text-right text-amber-600 bg-amber-50/50">Med</th>
                <th className="px-2 py-1 text-right text-amber-600 bg-amber-50/50">Worst</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((row, rank) => {
                const s = row.stress;
                const sus = s.sustainability;
                const inc = s.income_stability;

                // Final capital percentiles
                const lastIdx = s.ages.length - 1;
                const capP90 = s.percentile_trajectories.p90?.[lastIdx]?.total_capital ?? 0;
                const capP50 = s.percentile_trajectories.p50?.[lastIdx]?.total_capital ?? 0;
                const capP10 = s.percentile_trajectories.p10?.[lastIdx]?.total_capital ?? 0;

                const susColor = sus.rate >= 0.8 ? 'text-green-700 font-bold' :
                                 sus.rate >= 0.5 ? 'text-amber-700 font-bold' : 'text-red-600 font-bold';

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {sortGoal !== 'none' && (
                        <span className="inline-block w-5 text-center text-gray-400 mr-1">#{rank + 1}</span>
                      )}
                      {row.name}
                    </td>
                    <td className={`px-3 py-2 text-center ${susColor}`}>{pct(sus.rate)}</td>
                    {/* Income ratios */}
                    <td className="px-2 py-2 text-center text-green-700">{pct(inc.best_income_ratio)}</td>
                    <td className="px-2 py-2 text-center text-blue-700">{pct(inc.median_income_ratio)}</td>
                    <td className="px-2 py-2 text-center text-red-600">{pct(inc.worst_income_ratio)}</td>
                    {/* Cumulative income */}
                    <td className="px-2 py-2 text-right text-green-700">{fmt(s.cumulative_income.best)}</td>
                    <td className="px-2 py-2 text-right text-blue-700">{fmt(s.cumulative_income.median)}</td>
                    <td className="px-2 py-2 text-right text-red-600">{fmt(s.cumulative_income.worst)}</td>
                    {/* Capital at end */}
                    <td className="px-2 py-2 text-right text-green-700">{fmt(capP90)}</td>
                    <td className="px-2 py-2 text-right text-blue-700">{fmt(capP50)}</td>
                    <td className="px-2 py-2 text-right text-red-600">{fmt(capP10)}</td>
                    {/* Worst period */}
                    <td className="px-3 py-2 text-gray-600">{s.worst_window.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info note */}
      <p className="text-xs text-gray-500">
        All strategies tested with your current pots, drawdown order, and end age.
        Income-based strategies use your current target income ({fmt(config.target_income.net_annual)}/yr).
        Each strategy uses its default parameters.
      </p>
    </div>
  );
}
