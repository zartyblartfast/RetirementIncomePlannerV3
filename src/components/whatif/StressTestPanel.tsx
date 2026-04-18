/**
 * StressTestPanel — Historical stress test results display.
 *
 * Runs the backtest engine across 100+ historical periods, then shows:
 * - Summary cards (sustainability rate, income stability, worst period)
 * - Fan charts (capital & income percentile bands)
 * - Period timeline table (worst/median/best selectable)
 */

import { useState, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Shield, History } from 'lucide-react';
import type { PlannerConfig } from '../../engine/types';
import { runBacktest, extractStressTest } from '../../engine/backtest';
import type { StressTestResult } from '../../engine/backtest';
import { getStrategyDisplayName } from '../../engine/strategies';

interface Props {
  config: PlannerConfig;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function pct(n: number): string {
  return Math.round(n * 100) + '%';
}

function tickFmt(v: number): string {
  return `£${(v / 1000).toFixed(0)}k`;
}

export default function StressTestPanel({ config }: Props) {
  const [timelineView, setTimelineView] = useState<'worst' | 'median' | 'best'>('worst');

  const stress = useMemo<StressTestResult | null>(() => {
    const bt = runBacktest(config);
    return extractStressTest(bt);
  }, [config]);

  if (!stress) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">No historical data available for this configuration.</p>
      </div>
    );
  }

  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const sus = stress.sustainability;
  const inc = stress.income_stability;
  const worst = stress.worst_window;
  const best = stress.best_window;

  // Fan chart data — compute band differences for proper stacking
  function buildFanData(field: 'total_capital' | 'net_income') {
    return stress!.ages.map((age, i) => {
      const p5  = stress!.percentile_trajectories.p5?.[i]?.[field] ?? 0;
      const p10 = stress!.percentile_trajectories.p10?.[i]?.[field] ?? 0;
      const p25 = stress!.percentile_trajectories.p25?.[i]?.[field] ?? 0;
      const p50 = stress!.percentile_trajectories.p50?.[i]?.[field] ?? 0;
      const p75 = stress!.percentile_trajectories.p75?.[i]?.[field] ?? 0;
      const p90 = stress!.percentile_trajectories.p90?.[i]?.[field] ?? 0;
      return {
        age,
        // Stacked bands: base + differences
        base: p5,
        band_5_10:  Math.max(0, p10 - p5),
        band_10_25: Math.max(0, p25 - p10),
        band_25_50: Math.max(0, p50 - p25),
        band_50_75: Math.max(0, p75 - p50),
        band_75_90: Math.max(0, p90 - p75),
        // Raw values for overlay lines & tooltip
        p5, p10, p25, p50, p75, p90,
      };
    });
  }
  const fanCapitalData = buildFanData('total_capital');
  const fanIncomeData = buildFanData('net_income');

  const timelineWindows = {
    worst: stress.worst_window,
    median: stress.median_window,
    best: stress.best_window,
  };
  const timelineData = timelineWindows[timelineView];
  const timelineColors = { worst: '#dc3545', median: '#0d6efd', best: '#198754' };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-500" />
          Historical Stress Test
        </h2>
        <span className="text-sm text-gray-500">
          {getStrategyDisplayName(strategyId)} — {stress.n_windows} periods
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Sustainability */}
        <div className={`rounded-lg border p-4 text-center ${
          sus.rate >= 0.8 ? 'border-green-200 bg-green-50' :
          sus.rate >= 0.5 ? 'border-amber-200 bg-amber-50' :
          'border-red-200 bg-red-50'
        }`}>
          <p className="text-sm text-gray-600 mb-1">Money Lasts to End?</p>
          <p className={`text-3xl font-bold ${
            sus.rate >= 0.8 ? 'text-green-700' :
            sus.rate >= 0.5 ? 'text-amber-700' :
            'text-red-700'
          }`}>
            {pct(sus.rate)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {sus.count} of {sus.total} periods
          </p>
          {sus.depletion_age_dist.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Depleted: {sus.depletion_age_dist.map(d => `${d.count} at age ${d.age}`).join(', ')}
            </p>
          )}
        </div>

        {/* Income Stability */}
        <div className={`rounded-lg border p-4 text-center ${
          inc.median_income_ratio >= 0.95 ? 'border-green-200 bg-green-50' :
          inc.median_income_ratio >= 0.8 ? 'border-amber-200 bg-amber-50' :
          'border-red-200 bg-red-50'
        }`}>
          <p className="text-sm text-gray-600 mb-1">Median Income Maintained</p>
          <p className={`text-3xl font-bold ${
            inc.median_income_ratio >= 0.95 ? 'text-green-700' :
            inc.median_income_ratio >= 0.8 ? 'text-amber-700' :
            'text-red-700'
          }`}>
            {pct(inc.median_income_ratio)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Worst single year: {pct(inc.worst_income_ratio)} of target
          </p>
        </div>

        {/* Worst Period */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-sm text-gray-600 mb-1">Worst Period</p>
          <p className="text-lg font-bold text-gray-900">{worst.label}</p>
          <p className="text-xs text-gray-500 mt-1">
            {worst.depletion_age
              ? `Depleted at age ${worst.depletion_age}`
              : `Final capital: ${fmt(worst.final_capital)}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Best: {best.label} ({fmt(best.final_capital)})
          </p>
        </div>
      </div>

      {/* Cumulative Income Summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Total Income (Worst)</p>
            <p className="text-sm font-bold text-red-600">{fmt(stress.cumulative_income.worst)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Income (Median)</p>
            <p className="text-sm font-bold text-blue-600">{fmt(stress.cumulative_income.median)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Income (Best)</p>
            <p className="text-sm font-bold text-green-600">{fmt(stress.cumulative_income.best)}</p>
          </div>
        </div>
      </div>

      {/* Capital Fan Chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Capital Trajectory — Historical Percentile Bands
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={fanCapitalData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div className="rounded bg-white border border-gray-200 shadow-sm p-2 text-xs">
                    <p className="font-semibold mb-1">Age {label}</p>
                    <p style={{ color: '#15803d' }}>P90: {fmt(d.p90)}</p>
                    <p style={{ color: '#22863a' }}>P75: {fmt(d.p75)}</p>
                    <p style={{ color: '#0d6efd' }} className="font-bold">P50: {fmt(d.p50)}</p>
                    <p style={{ color: '#d97706' }}>P25: {fmt(d.p25)}</p>
                    <p style={{ color: '#dc3545' }}>P10: {fmt(d.p10)}</p>
                    <p style={{ color: '#991b1b' }}>P5: {fmt(d.p5)}</p>
                  </div>
                );
              }}
            />
            {/* Stacked bands: invisible base + colored band differences */}
            <Area stackId="fan" type="monotone" dataKey="base" fill="transparent" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_5_10" fill="#991b1b30" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_10_25" fill="#dc354525" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_25_50" fill="#d9770625" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_50_75" fill="#65a30d20" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_75_90" fill="#15803d20" stroke="none" isAnimationActive={false} />
            {/* Overlay lines for key percentiles */}
            <Line type="monotone" dataKey="p90" stroke="#15803d88" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p50" stroke="#0d6efd" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p5" stroke="#991b1b88" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Income Fan Chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Net Income — Historical Percentile Bands
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={fanIncomeData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div className="rounded bg-white border border-gray-200 shadow-sm p-2 text-xs">
                    <p className="font-semibold mb-1">Age {label}</p>
                    <p style={{ color: '#15803d' }}>P90: {fmt(d.p90)}</p>
                    <p style={{ color: '#22863a' }}>P75: {fmt(d.p75)}</p>
                    <p style={{ color: '#0d6efd' }} className="font-bold">P50: {fmt(d.p50)}</p>
                    <p style={{ color: '#d97706' }}>P25: {fmt(d.p25)}</p>
                    <p style={{ color: '#dc3545' }}>P10: {fmt(d.p10)}</p>
                    <p style={{ color: '#991b1b' }}>P5: {fmt(d.p5)}</p>
                  </div>
                );
              }}
            />
            {/* Stacked bands */}
            <Area stackId="fan" type="monotone" dataKey="base" fill="transparent" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_5_10" fill="#991b1b30" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_10_25" fill="#dc354525" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_25_50" fill="#d9770625" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_50_75" fill="#65a30d20" stroke="none" isAnimationActive={false} />
            <Area stackId="fan" type="monotone" dataKey="band_75_90" fill="#15803d20" stroke="none" isAnimationActive={false} />
            {/* Overlay lines */}
            <Line type="monotone" dataKey="p90" stroke="#15803d88" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p50" stroke="#0d6efd" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p5" stroke="#991b1b88" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Period Timeline */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Period Timeline</h3>
          <select
            value={timelineView}
            onChange={e => setTimelineView(e.target.value as 'worst' | 'median' | 'best')}
            className="text-sm rounded border-gray-300 py-0.5 px-2"
            style={{ color: timelineColors[timelineView] }}
          >
            <option value="worst" style={{ color: '#dc3545' }}>Worst Period</option>
            <option value="median" style={{ color: '#0d6efd' }}>Median Period</option>
            <option value="best" style={{ color: '#198754' }}>Best Period</option>
          </select>
          <span className="text-xs text-gray-500 ml-auto">{timelineData.label}</span>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: 350 }}>
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2 text-left font-medium text-gray-600">Age</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Year</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Market</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Capital</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Income</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Target</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">% of Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {timelineData.timeline.map(row => {
                const ratio = row.income_ratio;
                const ratioColor = ratio >= 0.95 ? 'text-green-700' : ratio >= 0.8 ? 'text-amber-700' : 'text-red-600';
                return (
                  <tr key={row.age} className={`hover:bg-gray-50 ${row.shortfall ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-1.5 font-medium text-gray-700">{row.age}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.calendar_year}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">
                      {row.market_return !== null ? `${row.market_return > 0 ? '+' : ''}${row.market_return.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(row.total_capital)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(row.net_income)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{fmt(row.target_income)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${ratioColor}`}>
                      {pct(ratio)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology */}
      <details className="text-sm text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700">Methodology & Data Sources</summary>
        <div className="mt-2 space-y-1 text-xs">
          <p><strong>Equity returns:</strong> 70% S&P 500 total return + 30% UK share price return (price only, no dividends). UK component understates total return.</p>
          <p><strong>Bond returns:</strong> UK gilt yields (BoE Millennium), approximated as yield + 10yr duration × (−Δyield).</p>
          <p><strong>Inflation:</strong> UK CPI from BoE Millennium (to 2016) + ONS CPI (2017+).</p>
          <p><strong>Cash:</strong> Bank of England Bank Rate.</p>
          <p><strong>Method:</strong> Each pot's return is weighted by its asset allocation. The projection is run for every viable historical period of the required length. Results show how the scenario would have performed across {stress.n_windows} years of real market history.</p>
        </div>
      </details>
    </div>
  );
}
