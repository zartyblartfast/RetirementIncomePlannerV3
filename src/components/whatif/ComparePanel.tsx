/**
 * ComparePanel — side-by-side comparison of 2+ scenarios.
 *
 * Shows overlay capital chart, overlay income chart, summary table,
 * and key insights highlighting the most significant differences.
 */

import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import type { PlannerConfig, ProjectionResult } from '../../engine/types';
import { getKeyWindowStarts, runProjectionForWindow } from '../../engine/backtest';
import type { KeyWindowStarts } from '../../engine/backtest';
import { runProjection } from '../../engine/projection';
import { getStrategyDisplayName } from '../../engine/strategies';

// ── colours (same palette as V1 compare) ─────────────────────────────
const COLOURS = ['#0d6efd', '#dc3545', '#198754', '#fd7e14', '#6f42c1', '#20c997'];

export interface CompareItem {
  name: string;
  config: PlannerConfig;
}

interface Props {
  items: CompareItem[];
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function tickFmt(v: number): string {
  return `£${(v / 1000).toFixed(0)}k`;
}

type WindowView = 'worst' | 'median' | 'best';
const EXTRA_YEARS = 5;

export default function ComparePanel({ items }: Props) {
  const [windowView, setWindowView] = useState<WindowView>('median');

  const planEndAge = items[0]!.config.personal.end_age;

  // Compute key window start years from the first scenario (reference)
  const keyWindows = useMemo<KeyWindowStarts | null>(() => {
    const refConfig = items[0]!.config;
    return getKeyWindowStarts(refConfig);
  }, [items]);

  // Run ALL scenarios through the SAME selected historical window
  const { results } = useMemo(() => {
    if (keyWindows === null) {
      return {
        results: items.map(item => ({ ...item, result: runProjection(item.config) })),
        windowLabel: null as string | null,
      };
    }
    const selected = keyWindows[windowView];
    return {
      results: items.map(item => ({
        ...item,
        result: runProjectionForWindow(item.config, selected.start, EXTRA_YEARS),
      })),
      windowLabel: selected.label,
    };
  }, [items, keyWindows, windowView]);

  // Build union of all ages
  const allAges = useMemo(() => {
    const ageSet = new Set<number>();
    for (const r of results) {
      for (const yr of r.result.years) ageSet.add(yr.age);
    }
    return [...ageSet].sort((a, b) => a - b);
  }, [results]);

  // Capital overlay data
  const capitalData = useMemo(() =>
    allAges.map(age => {
      const row: Record<string, number | null> = { age };
      for (const r of results) {
        const yr = r.result.years.find(y => y.age === age);
        row[r.name] = yr ? Math.round(yr.total_capital) : null;
      }
      return row;
    }),
    [allAges, results],
  );

  // Income overlay data — includes pot/guaranteed split per scenario
  const incomeData = useMemo(() =>
    allAges.map(age => {
      const row: Record<string, number | null> = { age };
      for (const r of results) {
        const yr = r.result.years.find(y => y.age === age);
        row[r.name] = yr ? Math.round(yr.net_income_achieved) : null;
        const potNet = yr
          ? Math.round(Object.values(yr.withdrawal_detail).reduce((s, v) => s + v, 0))
          : null;
        row[`${r.name}__pot`] = potNet;
        row[`${r.name}__guar`] = yr && potNet !== null
          ? Math.round(yr.net_income_achieved - potNet)
          : null;
      }
      return row;
    }),
    [allAges, results],
  );

  // Pot depletion age per scenario (first age where total_capital < £100)
  const depletionAges = useMemo(() => {
    const map: Record<string, { age: number; income: number } | null> = {};
    for (const r of results) {
      const yr = r.result.years.find(y => y.total_capital < 100);
      map[r.name] = yr ? { age: yr.age, income: Math.round(yr.net_income_achieved) } : null;
    }
    return map;
  }, [results]);

  // Key insights
  const insights = useMemo(() => {
    const ins: string[] = [];
    const summaries = results.map(r => ({
      name: r.name,
      sustainable: r.result.summary.sustainable,
      shortfall: r.result.summary.first_shortfall_age,
      capital: r.result.summary.remaining_capital,
      tax: r.result.summary.total_tax_paid,
      totalIncome: r.result.years.reduce((s, yr) => s + yr.net_income_achieved, 0),
    }));

    // Best vs worst capital
    const bestCap = summaries.reduce((a, b) => a.capital > b.capital ? a : b);
    const worstCap = summaries.reduce((a, b) => a.capital < b.capital ? a : b);
    if (bestCap.name !== worstCap.name) {
      const diff = bestCap.capital - worstCap.capital;
      ins.push(`**${bestCap.name}** leaves ${fmt(diff)} more capital than **${worstCap.name}**`);
    }

    // Best vs worst total income
    const bestInc = summaries.reduce((a, b) => a.totalIncome > b.totalIncome ? a : b);
    const worstInc = summaries.reduce((a, b) => a.totalIncome < b.totalIncome ? a : b);
    if (bestInc.name !== worstInc.name) {
      const diff = bestInc.totalIncome - worstInc.totalIncome;
      ins.push(`**${bestInc.name}** delivers ${fmt(diff)} more total income than **${worstInc.name}**`);
    }

    // Sustainability
    const sustainable = summaries.filter(s => s.sustainable);
    const unsustainable = summaries.filter(s => !s.sustainable);
    if (sustainable.length > 0 && unsustainable.length > 0) {
      ins.push(`${sustainable.map(s => `**${s.name}**`).join(', ')} sustainable; ${unsustainable.map(s => `**${s.name}** (shortfall at ${s.shortfall})`).join(', ')}`);
    }

    return ins;
  }, [results]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">
          Scenario Comparison
        </h2>
        <div className="flex items-center gap-3">
          {keyWindows && (
            <select
              value={windowView}
              onChange={e => setWindowView(e.target.value as WindowView)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
            >
              <option value="worst">Worst Period ({keyWindows.worst.label})</option>
              <option value="median">Median Period ({keyWindows.median.label})</option>
              <option value="best">Best Period ({keyWindows.best.label})</option>
            </select>
          )}
          <span className="text-sm text-gray-500">{items.length} scenarios</span>
        </div>
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
          {insights.map((text, i) => (
            <p key={i} className="text-sm text-blue-900"
              dangerouslySetInnerHTML={{
                __html: text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
              }}
            />
          ))}
        </div>
      )}

      {/* Summary Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-600">Metric</th>
                {results.map((r, i) => (
                  <th key={r.name} className="px-4 py-2 text-center font-medium" style={{ color: COLOURS[i % COLOURS.length] }}>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <SummaryRow label="Strategy" values={results.map(r => getStrategyDisplayName(r.config.drawdown_strategy ?? 'fixed_target'))} />
              <SummaryRow label="End Age" values={results.map(r => String(r.config.personal.end_age))} />
              <SummaryRow label="CPI" values={results.map(r => `${(r.config.target_income.cpi_rate * 100).toFixed(1)}%`)} />
              <SummaryRow
                label="Sustainable?"
                values={results.map(r =>
                  r.result.summary.sustainable
                    ? '✓ Yes'
                    : `✗ Shortfall at ${r.result.summary.first_shortfall_age}`
                )}
                highlight={results.map(r => r.result.summary.sustainable ? 'green' : 'red')}
              />
              <SummaryRow label="Remaining Capital" values={results.map(r => fmt(r.result.summary.remaining_capital))} />
              <SummaryRow label="Total Tax" values={results.map(r => fmt(r.result.summary.total_tax_paid))} />
              <SummaryRow
                label="Total Net Income"
                values={results.map(r => fmt(r.result.years.reduce((s, yr) => s + yr.net_income_achieved, 0)))}
              />
              <SummaryRow
                label="Drawdown Order"
                values={results.map(r => r.config.withdrawal_priority.join(' → '))}
                small
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Capital Overlay Chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Capital Trajectory</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={capitalData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name]}
              labelFormatter={l => `Age ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={planEndAge} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: `Plan end (${planEndAge})`, position: 'top', fontSize: 10, fill: '#6b7280' }} />
            {results.map((r, i) => (
              <Line
                key={r.name}
                type="monotone"
                dataKey={r.name}
                stroke={COLOURS[i % COLOURS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Income Overlay Chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Net Income Achieved</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={incomeData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip content={<IncomeTooltip scenarioNames={results.map(r => r.name)} colours={COLOURS} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#9ca3af" />
            <ReferenceLine x={planEndAge} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: `Plan end (${planEndAge})`, position: 'top', fontSize: 10, fill: '#6b7280' }} />
            {results.map((r, i) => (
              <Line
                key={r.name}
                type="monotone"
                dataKey={r.name}
                stroke={COLOURS[i % COLOURS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
            {results.map((r, i) => {
              const dep = depletionAges[r.name];
              if (!dep) return null;
              return (
                <ReferenceDot
                  key={`dep-${r.name}`}
                  x={dep.age}
                  y={dep.income}
                  r={5}
                  fill={COLOURS[i % COLOURS.length]}
                  stroke="#fff"
                  strokeWidth={2}
                  isFront
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
        {Object.entries(depletionAges).some(([, v]) => v !== null) && (
          <p className="text-xs text-gray-500 mt-1 ml-1">
            ● = pots exhausted
          </p>
        )}
      </div>

      {/* Year-by-Year Delta Table */}
      <CompareYearTable results={results} allAges={allAges} planEndAge={planEndAge} />
    </div>
  );
}

// ── Custom income tooltip ────────────────────────────────────────────

function IncomeTooltip({ active, payload, label, scenarioNames, colours }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; payload: Record<string, number | null> }>;
  label?: number;
  scenarioNames: string[];
  colours: string[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 mb-1">Age {label}</p>
      {scenarioNames.map((name, i) => {
        const total = row[name];
        const pot = row[`${name}__pot`];
        const guar = row[`${name}__guar`];
        if (total == null) return null;
        return (
          <div key={name} className="mb-1 last:mb-0">
            <p className="font-medium" style={{ color: colours[i % colours.length] }}>{name}</p>
            <div className="ml-2 text-gray-600 space-y-px">
              <p>Total: <span className="font-medium text-gray-800">{fmt(total)}</span></p>
              {pot != null && <p>From pots: {fmt(pot)}</p>}
              {guar != null && <p>Guaranteed: {fmt(guar)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Summary row helper ───────────────────────────────────────────────

function SummaryRow({ label, values, highlight, small }: {
  label: string;
  values: string[];
  highlight?: ('green' | 'red' | null)[];
  small?: boolean;
}) {
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-gray-700">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-4 py-2 text-center ${small ? 'text-xs text-gray-500' : ''} ${
            highlight?.[i] === 'green' ? 'text-green-700 font-semibold' :
            highlight?.[i] === 'red' ? 'text-red-600 font-semibold' : ''
          }`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

// ── Year-by-year comparison table ────────────────────────────────────

function CompareYearTable({ results, allAges, planEndAge }: {
  results: { name: string; result: ProjectionResult }[];
  allAges: number[];
  planEndAge: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 bg-gray-50 border-b border-gray-200">
        Year-by-Year Comparison
      </h3>
      <div className="overflow-x-auto" style={{ maxHeight: 400 }}>
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2 text-left font-medium text-gray-600">Age</th>
              {results.map((r, i) => (
                <th key={`cap-${r.name}`} colSpan={1} className="px-3 py-2 text-right font-medium" style={{ color: COLOURS[i % COLOURS.length] }}>
                  {r.name} Capital
                </th>
              ))}
              {results.map((r, i) => (
                <th key={`inc-${r.name}`} colSpan={1} className="px-3 py-2 text-right font-medium" style={{ color: COLOURS[i % COLOURS.length] }}>
                  {r.name} Income
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allAges.map(age => (
              <tr key={age} className={`hover:bg-gray-50 ${age > planEndAge ? 'bg-amber-50/60' : ''} ${age === planEndAge ? 'border-b-2 border-gray-400' : ''}`}>
                <td className="px-3 py-1.5 font-medium text-gray-700">{age}</td>
                {results.map(r => {
                  const yr = r.result.years.find(y => y.age === age);
                  return (
                    <td key={`cap-${r.name}`} className="px-3 py-1.5 text-right text-gray-600">
                      {yr ? fmt(yr.total_capital) : '—'}
                    </td>
                  );
                })}
                {results.map(r => {
                  const yr = r.result.years.find(y => y.age === age);
                  return (
                    <td key={`inc-${r.name}`} className="px-3 py-1.5 text-right text-gray-600">
                      {yr ? fmt(yr.net_income_achieved) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
