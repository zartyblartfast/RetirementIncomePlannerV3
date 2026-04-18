/**
 * Optimise Page — Drawdown order analysis with multi-column sortable table,
 * max sustainable income search, max plan duration, income frontier,
 * and retirement age sensitivity.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useConfig } from '../store/configStore';
import { getStrategyDisplayName, STRATEGIES } from '../engine/strategies';
import {
  analyseDrawdownOrders,
  findMaxSustainableIncome,
  incomeSweep,
  getKeyWindowStarts,
} from '../engine/optimiser';
import type {
  OrderMetrics,
  DrawdownOrderResult,
  MaxIncomeResult,
  IncomeSweepPoint,
  KeyWindowStarts,
} from '../engine/optimiser';

// ── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function tickFmt(v: number): string {
  return `£${(v / 1000).toFixed(0)}k`;
}

// ── Sort types ───────────────────────────────────────────────────────
type SortKey = 'remaining_capital' | 'total_tax' | 'total_income' | 'first_shortfall_age' | 'depletion_age';
type SortDir = 'asc' | 'desc';

interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

const SORT_LABELS: Record<SortKey, string> = {
  remaining_capital: 'End Capital',
  total_tax: 'Total Tax',
  total_income: 'Total Income',
  first_shortfall_age: 'Shortfall Age',
  depletion_age: 'Depletion Age',
};

const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  remaining_capital: 'desc',
  total_tax: 'asc',
  total_income: 'desc',
  first_shortfall_age: 'desc',
  depletion_age: 'desc',
};

function compareMetric(a: OrderMetrics, b: OrderMetrics, spec: SortSpec): number {
  // Sustainable always first
  if (a.sustainable !== b.sustainable) return a.sustainable ? -1 : 1;

  let va: number;
  let vb: number;

  if (spec.key === 'first_shortfall_age') {
    va = a.first_shortfall_age ?? 999;
    vb = b.first_shortfall_age ?? 999;
  } else if (spec.key === 'depletion_age') {
    va = a.depletion_age ?? 999;
    vb = b.depletion_age ?? 999;
  } else {
    va = a[spec.key];
    vb = b[spec.key];
  }

  const diff = va - vb;
  return spec.dir === 'asc' ? diff : -diff;
}

function multiSort(rows: OrderMetrics[], sorts: SortSpec[]): OrderMetrics[] {
  return [...rows].sort((a, b) => {
    for (const spec of sorts) {
      const c = compareMetric(a, b, spec);
      if (c !== 0) return c;
    }
    return 0;
  });
}

// ── Window selector types ────────────────────────────────────────────
type WindowView = 'static' | 'worst' | 'median' | 'best';

// =====================================================================
//  Main Component
// =====================================================================
export default function Optimise() {
  const { config, updateConfig } = useConfig();
  const strategyId = config.drawdown_strategy ?? 'fixed_target';

  // Window selection
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

  // Sort state (multi-column)
  const [sorts, setSorts] = useState<SortSpec[]>([
    { key: 'remaining_capital', dir: 'desc' },
  ]);

  // Selected row for Apply
  const [selectedOrder, setSelectedOrder] = useState<string[] | null>(null);

  // Collapsible sections
  const [showIncome, setShowIncome] = useState(false);
  const [showSweep, setShowSweep] = useState(false);

  // ── Compute drawdown order analysis ────────────────────────────────
  const orderResult = useMemo<DrawdownOrderResult>(() => {
    return analyseDrawdownOrders(config, windowStart);
  }, [config, windowStart]);

  const sortedRows = useMemo(
    () => multiSort(orderResult.permutations, sorts),
    [orderResult.permutations, sorts],
  );

  // ── Lazy compute: max income ───────────────────────────────────────
  const [incomeResult, setIncomeResult] = useState<MaxIncomeResult | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);

  const computeIncome = useCallback(() => {
    setShowIncome(true);
    if (incomeResult) return;
    setIncomeLoading(true);
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const r = findMaxSustainableIncome(config, windowStart);
      setIncomeResult(r);
      setIncomeLoading(false);
    }, 10);
  }, [config, windowStart, incomeResult]);

  // ── Lazy compute: income sweep ─────────────────────────────────────
  const [sweepResult, setSweepResult] = useState<IncomeSweepPoint[] | null>(null);
  const [sweepLoading, setSweepLoading] = useState(false);

  const computeSweep = useCallback(() => {
    setShowSweep(true);
    if (sweepResult) return;
    setSweepLoading(true);
    setTimeout(() => {
      const maxInc = incomeResult?.max_income ?? config.target_income.net_annual * 1.5;
      const r = incomeSweep(config, maxInc, windowStart);
      setSweepResult(r);
      setSweepLoading(false);
    }, 10);
  }, [config, windowStart, sweepResult, incomeResult]);

  // Reset lazy results when config/window changes
  useMemo(() => {
    setIncomeResult(null);
    setSweepResult(null);
  }, [config, windowStart]);

  // ── Sort handlers ──────────────────────────────────────────────────
  function handleSort(key: SortKey, shiftKey: boolean) {
    setSorts(prev => {
      const existing = prev.findIndex(s => s.key === key);

      if (existing >= 0) {
        if (shiftKey && prev.length > 1) {
          // Shift+click existing column → remove it from sort
          return prev.filter((_, i) => i !== existing);
        }
        // Plain click existing column → toggle direction (preserves other columns)
        const next = [...prev];
        next[existing] = { key, dir: prev[existing]!.dir === 'asc' ? 'desc' : 'asc' };
        return next;
      }

      // New column with shift → add as secondary/tertiary sort
      if (shiftKey) {
        return [...prev, { key, dir: DEFAULT_SORT_DIR[key] }];
      }

      // New column without shift → replace all with single sort
      return [{ key, dir: DEFAULT_SORT_DIR[key] }];
    });
  }

  // ── Apply selected order ───────────────────────────────────────────
  function applyOrder() {
    if (!selectedOrder) return;
    updateConfig(prev => ({
      ...prev,
      withdrawal_priority: selectedOrder,
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Optimise</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Analyse drawdown order permutations · Strategy: {getStrategyDisplayName(strategyId)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={windowView}
            onChange={e => setWindowView(e.target.value as WindowView)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
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
          <span className="text-xs text-gray-400">{windowLabel}</span>
        </div>
      </div>

      {/* ── Drawdown Order Table ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Drawdown Order Analysis
            <span className="ml-2 text-xs font-normal text-gray-400">
              {orderResult.permutations.length} permutations · click header to sort · shift+click for multi-sort
            </span>
          </h2>
          {selectedOrder && (
            <button
              onClick={applyOrder}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Apply Selected Order
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Drawdown Order</th>
                {(Object.keys(SORT_LABELS) as SortKey[]).map(key => {
                  const sortIdx = sorts.findIndex(s => s.key === key);
                  const spec = sortIdx >= 0 ? sorts[sortIdx]! : null;
                  return (
                    <th
                      key={key}
                      className="text-right py-2 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
                      onClick={e => handleSort(key, e.shiftKey)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {SORT_LABELS[key]}
                        {spec ? (
                          <span className="inline-flex items-center">
                            {spec.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                            {sorts.length > 1 && (
                              <span className="text-[10px] font-bold text-blue-600 -ml-0.5">{sortIdx + 1}</span>
                            )}
                          </span>
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const isCurrent = row.label === orderResult.currentLabel;
                const isSelected = selectedOrder?.join(',') === row.order.join(',');
                return (
                  <tr
                    key={row.label}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-300'
                        : isCurrent
                          ? 'bg-amber-50/50'
                          : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedOrder(row.order)}
                  >
                    <td className="py-2 px-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2 px-2 font-medium text-gray-800 whitespace-nowrap">
                      {isCurrent && <span className="text-amber-600 mr-1" title="Current order">★</span>}
                      {i === 0 && <span className="text-blue-600 mr-1" title="Best for current sort">▶</span>}
                      {row.label}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.remaining_capital)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.total_tax)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(row.total_income)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {row.first_shortfall_age
                        ? <span className="text-red-600 font-medium">{row.first_shortfall_age}</span>
                        : <span className="text-green-600">None</span>}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {row.depletion_age ?? <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          <span>★ = your current order</span>
          <span>▶ = best for current sort</span>
          <span>Click a row to select · then Apply</span>
        </div>
      </div>

      {/* ── Collapsible: Max Sustainable Income ── */}
      <CollapsibleSection
        title="Max Sustainable Income"
        subtitle="Highest annual income that lasts to plan end"
        open={showIncome}
        onToggle={() => showIncome ? setShowIncome(false) : computeIncome()}
      >
        {incomeLoading ? <Spinner /> : incomeResult && (
          incomeResult.portfolio_driven ? (
            <p className="text-sm text-gray-500 italic">
              Not applicable — your strategy ({getStrategyDisplayName(strategyId)}) derives income from portfolio value.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard label="Current Income" value={fmt(incomeResult.current_income)} />
              <MetricCard label="Max Sustainable" value={fmt(incomeResult.max_income)} highlight />
              <MetricCard label="Headroom" value={`${incomeResult.headroom >= 0 ? '+' : ''}${fmt(incomeResult.headroom)}`}
                          sub={`${incomeResult.headroom_pct >= 0 ? '+' : ''}${incomeResult.headroom_pct}%`} />
              <MetricCard label="Window" value={windowLabel} />
            </div>
          )
        )}
      </CollapsibleSection>

      {/* ── Collapsible: Income Frontier ── */}
      <CollapsibleSection
        title="Income Frontier"
        subtitle="Trade-off between income level and sustainability"
        open={showSweep}
        onToggle={() => showSweep ? setShowSweep(false) : computeSweep()}
      >
        {sweepLoading ? <Spinner /> : STRATEGIES[strategyId]?.portfolio_driven ? (
          <p className="text-sm text-gray-500 italic">
            Not applicable — {getStrategyDisplayName(strategyId)} derives income from portfolio value, so there is no income level to vary.
          </p>
        ) : sweepResult && sweepResult.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sweepResult} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="income"
                tick={{ fontSize: 11 }}
                tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
                label={{ value: 'Annual Income', position: 'insideBottom', offset: -2, fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={tickFmt}
                label={{ value: 'End Capital', angle: -90, position: 'insideLeft', fontSize: 11 }}
              />
              <Tooltip
                formatter={(v: number, name: string) => [fmt(v), name === 'remaining_capital' ? 'End Capital' : name]}
                labelFormatter={l => `Income: £${(Number(l) / 1000).toFixed(0)}k/yr`}
              />
              <Line
                type="monotone"
                dataKey="remaining_capital"
                stroke="#0d6efd"
                strokeWidth={2}
                dot={(props: Record<string, unknown>) => {
                  const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                  const pt = sweepResult[index];
                  if (!pt) return <circle key={index} cx={cx} cy={cy} r={0} />;
                  return (
                    <circle
                      key={index} cx={cx} cy={cy}
                      r={pt.is_current ? 6 : pt.sustainable ? 3 : 3}
                      fill={pt.is_current ? '#fd7e14' : pt.sustainable ? '#0d6efd' : '#dc3545'}
                      stroke={pt.is_current ? '#fff' : 'none'}
                      strokeWidth={pt.is_current ? 2 : 0}
                    />
                  );
                }}
              />
              <ReferenceLine y={0} stroke="#9ca3af" />
              {sweepResult.find(p => p.is_current) && (
                <ReferenceDot
                  x={sweepResult.find(p => p.is_current)!.income}
                  y={sweepResult.find(p => p.is_current)!.remaining_capital}
                  r={0}
                  label={{ value: '← Current', position: 'right', fill: '#fd7e14', fontSize: 11, fontWeight: 600 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CollapsibleSection>

    </div>
  );
}

// ── Reusable Components ──────────────────────────────────────────────

function CollapsibleSection({
  title, subtitle, open, onToggle, children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function MetricCard({
  label, value, sub, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin" />
      Computing…
    </div>
  );
}
