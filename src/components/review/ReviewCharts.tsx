/**
 * Plan vs Actual charts for the Review page.
 *
 * Capital chart:  dashed planned line + actual dots + solid revised line
 * Income chart:   light planned bars + solid actual bars
 *
 * When strategyChanged=true, only the actual data points are shown
 * (no baseline planned line — it would be apples vs oranges).
 */

import { useMemo } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { YearRow } from '../../engine/types';
import type { ReviewSnapshot } from '../../store/reviewStore';

// ── Colours ──────────────────────────────────────────────────────────
const PLANNED_CAP   = '#94a3b8';  // slate-400 (muted)
const ACTUAL_CAP    = '#2563eb';  // blue-600
const REVISED_CAP   = '#0d9488';  // teal-600
const PLANNED_INC   = '#cbd5e1';  // slate-300 (light)
const ACTUAL_INC    = '#2563eb';  // blue-600
const REVISED_INC   = '#0d9488';  // teal-600

// ── Formatters ───────────────────────────────────────────────────────
function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}
function tickFmt(v: number): string {
  return `£${(v / 1000).toFixed(0)}k`;
}

// ── Types ────────────────────────────────────────────────────────────
interface Props {
  baselineYears: YearRow[];       // projection from locked baseline config
  currentYears: YearRow[];        // projection from current (revised) config
  reviews: ReviewSnapshot[];      // actual review snapshots
  dobYM: string;                  // "YYYY-MM" date of birth
  retirementAge: number;
  strategyChanged: boolean;       // suppress baseline lines if true
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert a review date to an approximate age given DOB. */
function reviewAge(reviewDate: string, dobYM: string): number {
  const [dy, dm] = dobYM.split('-').map(Number) as [number, number];
  const [ry, rm] = reviewDate.split('-').map(Number) as [number, number];
  return Math.floor(((ry * 12 + rm) - (dy * 12 + dm)) / 12);
}

export default function ReviewCharts({
  baselineYears, currentYears, reviews, dobYM, retirementAge, strategyChanged,
}: Props) {

  // ── Capital chart data ─────────────────────────────────────────────
  const capitalData = useMemo(() => {
    // Build age → row map from baseline years
    const byAge = new Map<number, Record<string, number | null>>();

    if (!strategyChanged) {
      for (const yr of baselineYears) {
        byAge.set(yr.age, {
          age: yr.age,
          planned: Math.round(yr.total_capital),
          actual: null,
          revised: null,
        });
      }
    }

    // Overlay revised (current) projection
    for (const yr of currentYears) {
      const row = byAge.get(yr.age) ?? { age: yr.age, planned: null, actual: null, revised: null };
      row.revised = Math.round(yr.total_capital);
      byAge.set(yr.age, row);
    }

    // Overlay actual review data points
    for (const rev of reviews) {
      const age = reviewAge(rev.date, dobYM);
      const total = Object.values(rev.pot_balances).reduce((s, v) => s + v, 0);
      const row = byAge.get(age) ?? { age, planned: null, actual: null, revised: null };
      row.actual = Math.round(total);
      byAge.set(age, row);
    }

    return [...byAge.values()].sort((a, b) => (a.age as number) - (b.age as number));
  }, [baselineYears, currentYears, reviews, dobYM, strategyChanged]);

  // ── Income chart data ──────────────────────────────────────────────
  // Aggregate review income into calendar ages for comparison with yearly projection
  const incomeData = useMemo(() => {
    const byAge = new Map<number, Record<string, number | null>>();

    if (!strategyChanged) {
      for (const yr of baselineYears) {
        byAge.set(yr.age, {
          age: yr.age,
          planned: Math.round(yr.net_income_achieved),
          actual: null,
          revised: null,
        });
      }
    }

    // Revised forward projection income
    for (const yr of currentYears) {
      const row = byAge.get(yr.age) ?? { age: yr.age, planned: null, actual: null, revised: null };
      row.revised = Math.round(yr.net_income_achieved);
      byAge.set(yr.age, row);
    }

    // Actual income from reviews — aggregate per age year
    for (const rev of reviews) {
      const age = reviewAge(rev.date, dobYM);
      const totalInc = Object.values(rev.income_since_last).reduce((s, v) => s + v, 0);
      if (totalInc > 0) {
        const row = byAge.get(age) ?? { age, planned: null, actual: null, revised: null };
        // Accumulate if multiple reviews in same age year
        row.actual = ((row.actual as number | null) ?? 0) + Math.round(totalInc);
        byAge.set(age, row);
      }
    }

    return [...byAge.values()].sort((a, b) => (a.age as number) - (b.age as number));
  }, [baselineYears, currentYears, reviews, dobYM, strategyChanged]);

  const hasActuals = reviews.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Capital: Plan vs Actual ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          {strategyChanged ? 'Capital History & Projection' : 'Capital: Plan vs Actual'}
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          {strategyChanged
            ? 'Actual balances from reviews and forward projection from current position'
            : 'Planned trajectory (baseline) vs actual review balances vs revised projection'}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={capitalData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name]}
              labelFormatter={l => `Age ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Planned (baseline) — dashed, only when strategy unchanged */}
            {!strategyChanged && (
              <Line
                type="monotone"
                dataKey="planned"
                name="Planned"
                stroke={PLANNED_CAP}
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={false}
                connectNulls
              />
            )}

            {/* Revised (forward from current config) — solid */}
            <Line
              type="monotone"
              dataKey="revised"
              name="Revised Projection"
              stroke={REVISED_CAP}
              strokeWidth={2}
              dot={false}
              connectNulls
            />

            {/* Actual (review data points) — dots */}
            {hasActuals && (
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={ACTUAL_CAP}
                strokeWidth={0}
                dot={{ r: 5, fill: ACTUAL_CAP, stroke: '#fff', strokeWidth: 2 }}
                connectNulls={false}
              />
            )}

            {/* Retirement age reference line */}
            <ReferenceLine
              x={retirementAge}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{ value: 'Retirement', position: 'top', fill: '#94a3b8', fontSize: 10 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Income: Plan vs Actual ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          {strategyChanged ? 'Income History & Projection' : 'Income: Plan vs Actual'}
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          {strategyChanged
            ? 'Net income drawn (from reviews) and projected forward income'
            : 'Planned net income (baseline) vs actual drawn vs revised projection'}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={incomeData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name]}
              labelFormatter={l => `Age ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Planned (baseline) — light bars, only when strategy unchanged */}
            {!strategyChanged && (
              <Bar
                dataKey="planned"
                name="Planned Income"
                fill={PLANNED_INC}
                radius={[2, 2, 0, 0]}
              />
            )}

            {/* Actual income from reviews — solid bars */}
            {hasActuals && (
              <Bar
                dataKey="actual"
                name="Actual Income"
                fill={ACTUAL_INC}
                radius={[2, 2, 0, 0]}
              />
            )}

            {/* Revised forward projection — line overlay */}
            <Line
              type="monotone"
              dataKey="revised"
              name="Revised Projection"
              stroke={REVISED_INC}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
