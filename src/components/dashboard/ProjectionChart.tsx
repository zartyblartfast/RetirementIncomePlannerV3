import { useMemo } from 'react';
import {
  AreaChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Line, ComposedChart,
} from 'recharts';
import type { YearRow, ProjectionSummary } from '../../engine/types';

interface Props {
  years: YearRow[];
  summary: ProjectionSummary;
  strategyName?: string;
}

// ── colour palettes (matching V1) ──────────────────────────────────
const CAP_COLOURS = ['#0d6efd', '#fd7e14', '#198754', '#dc3545', '#6f42c1', '#20c997', '#ffc107'];
const GUAR_COLOURS = ['#2e86de', '#54a0ff', '#48dbfb', '#0abde3'];
const DRAW_COLOURS = ['#10ac84', '#1dd1a1', '#feca57', '#ff9f43'];

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function tickFmt(v: number): string {
  return `£${(v / 1000).toFixed(0)}k`;
}

function tickFmtSigned(v: number): string {
  const sign = v < 0 ? '-' : '';
  return `${sign}£${(Math.abs(v) / 1000).toFixed(0)}k`;
}

export default function ProjectionChart({ years, summary, strategyName }: Props) {
  // Dynamically discover pot and guaranteed-income names from the data
  const { potNames, tfNames, guarNames } = useMemo(() => {
    const pots = new Set<string>();
    const tfs = new Set<string>();
    const guars = new Set<string>();
    for (const yr of years) {
      for (const k of Object.keys(yr.pot_balances)) pots.add(k);
      for (const k of Object.keys(yr.tf_balances)) tfs.add(k);
      for (const k of Object.keys(yr.guaranteed_income)) guars.add(k);
    }
    return { potNames: [...pots], tfNames: [...tfs], guarNames: [...guars] };
  }, [years]);

  // Withdrawal detail names (DC pots + TF accounts that appear in withdrawal_detail)
  const drawdownNames = useMemo(() => {
    const names = new Set<string>();
    for (const yr of years) {
      for (const k of Object.keys(yr.withdrawal_detail)) names.add(k);
    }
    return [...names];
  }, [years]);

  // ── Capital Trajectory data ────────────────────────────────────────
  const capitalData = useMemo(() =>
    years.map(yr => {
      const row: Record<string, number> = { age: yr.age };
      for (const n of potNames) row[`cap_${n}`] = Math.round(yr.pot_balances[n] ?? 0);
      for (const n of tfNames) row[`cap_${n}`] = Math.round(yr.tf_balances[n] ?? 0);
      return row;
    }),
    [years, potNames, tfNames],
  );

  // ── Income Breakdown data ──────────────────────────────────────────
  const incomeData = useMemo(() =>
    years.map(yr => {
      const row: Record<string, number | null> = {
        age: yr.age,
        target_net: Math.round(yr.target_net),
        net_achieved: Math.round(yr.net_income_achieved),
        tax: yr.tax_due > 0 ? -Math.round(yr.tax_due) : null,
      };
      for (const n of guarNames) {
        const v = yr.guaranteed_income[n] ?? 0;
        row[`guar_${n}`] = v > 0 ? Math.round(v) : null;
      }
      for (const n of drawdownNames) {
        const v = yr.withdrawal_detail[n] ?? 0;
        row[`draw_${n}`] = v > 0 ? Math.round(v) : null;
      }
      return row;
    }),
    [years, guarNames, drawdownNames],
  );

  const planEndAge = summary.end_age;
  const subtitle = strategyName ? `Drawdown Strategy: ${strategyName}` : undefined;

  return (
    <div className="space-y-6">
      {/* ── Capital Trajectory ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Capital Trajectory</h3>
        {subtitle && <p className="text-xs font-medium text-blue-600 mb-3">{subtitle}</p>}
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={capitalData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name.replace(/^cap_/, '')]}
              labelFormatter={l => `Age ${l}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(v: string) => v.replace(/^cap_/, '')}
            />
            {[...potNames, ...tfNames].map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={`cap_${name}`}
                name={`cap_${name}`}
                fill={CAP_COLOURS[i % CAP_COLOURS.length]}
                stroke={CAP_COLOURS[i % CAP_COLOURS.length]}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            ))}
            <ReferenceLine
              x={planEndAge}
              stroke="#dc3545"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{ value: `Plan end (${planEndAge})`, position: 'top', fill: '#dc3545', fontSize: 11, fontWeight: 600 }}
            />

          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Income Breakdown ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Income Breakdown</h3>
        {subtitle && <p className="text-xs font-medium text-blue-600 mb-3">{subtitle}</p>}
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={incomeData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmtSigned} />
            <Tooltip
              formatter={(v: number, name: string) => {
                const label = name
                  .replace(/^guar_/, '')
                  .replace(/^draw_/, '')
                  .replace('tax', 'Tax Deducted')
                  .replace('target_net', 'Target Net Income')
                  .replace('net_achieved', 'Net Income Achieved');
                const sign = (v as number) < 0 ? '-' : '';
                return [`${sign}${fmt(Math.abs(v as number))}`, label];
              }}
              labelFormatter={l => `Age ${l}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v: string) =>
                v.replace(/^guar_/, '').replace(/^draw_/, (m) => {
                  void m; return '';
                }) + (v.startsWith('draw_') ? ' (drawdown)' : '')
              }
            />
            <ReferenceLine y={0} stroke="#9ca3af" />

            {/* Guaranteed income bars (stacked positive) */}
            {guarNames.map((name, i) => (
              <Bar
                key={`guar_${name}`}
                dataKey={`guar_${name}`}
                name={`guar_${name}`}
                stackId="income"
                fill={GUAR_COLOURS[i % GUAR_COLOURS.length]}
              />
            ))}

            {/* Drawdown bars (stacked positive) */}
            {drawdownNames.map((name, i) => (
              <Bar
                key={`draw_${name}`}
                dataKey={`draw_${name}`}
                name={`draw_${name}`}
                stackId="income"
                fill={DRAW_COLOURS[i % DRAW_COLOURS.length]}
              />
            ))}

            {/* Tax (negative bar) */}
            <Bar dataKey="tax" name="Tax Deducted" stackId="tax" fill="#ee5253cc" />

            {/* Target net income line (dashed) */}
            <Line
              type="monotone"
              dataKey="target_net"
              name="Target Net Income"
              stroke="#222f3e"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
            />

            {/* Net income achieved line (solid) */}
            <Line
              type="monotone"
              dataKey="net_achieved"
              name="Net Income Achieved"
              stroke="#10ac84"
              strokeWidth={2.5}
              dot={(props: Record<string, unknown>) => {
                const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                const yr = years[index];
                if (!yr) return <circle key={index} cx={cx} cy={cy} r={0} />;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={yr.shortfall ? 4 : 2}
                    fill={yr.shortfall ? '#ee5253' : '#10ac84'}
                    stroke="none"
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
