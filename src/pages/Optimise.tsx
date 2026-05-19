/**
 * Strategy Page - retirement income strategy and drawdown order analysis.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from 'lucide-react';
import { useConfig } from '../store/configStore';
import { getStrategyDisplayName } from '../engine/strategies';
import {
  analyseDrawdownOrders,
  getKeyWindowStarts,
} from '../engine/optimiser';
import type {
  DrawdownOrderResult,
  KeyWindowStarts,
  OrderMetrics,
} from '../engine/optimiser';
import DrawdownStagesPanel from '../components/dashboard/drawdownStageSummary';
import PensionAccessEventsPanel from '../components/strategy/PensionAccessEventsPanel';
import { deriveDrawdownStagesFromPriority } from '../engine/drawdownStages';

function fmt(n: number): string {
  return '\u00A3' + Math.round(n).toLocaleString('en-GB');
}

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
  depletion_age: 'Capital Exhausted Age',
};

const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  remaining_capital: 'desc',
  total_tax: 'asc',
  total_income: 'desc',
  first_shortfall_age: 'desc',
  depletion_age: 'desc',
};

function compareMetric(a: OrderMetrics, b: OrderMetrics, spec: SortSpec): number {
  // Sustainable orders always rank ahead of orders with shortfalls.
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

type WindowView = 'static' | 'worst' | 'median' | 'best';

export default function Optimise() {
  const { config, updateConfig } = useConfig();
  const strategyId = config.drawdown_strategy ?? 'fixed_target';

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

  const [sorts, setSorts] = useState<SortSpec[]>([
    { key: 'remaining_capital', dir: 'desc' },
  ]);
  const [selectedOrder, setSelectedOrder] = useState<string[] | null>(null);

  const orderResult = useMemo<DrawdownOrderResult>(() => {
    return analyseDrawdownOrders(config, windowStart);
  }, [config, windowStart]);

  const sortedRows = useMemo(
    () => multiSort(orderResult.permutations, sorts),
    [orderResult.permutations, sorts],
  );

  function handleSort(key: SortKey, shiftKey: boolean) {
    setSorts(prev => {
      const existing = prev.findIndex(s => s.key === key);

      if (existing >= 0) {
        if (shiftKey && prev.length > 1) {
          return prev.filter((_, i) => i !== existing);
        }
        const next = [...prev];
        next[existing] = { key, dir: prev[existing]!.dir === 'asc' ? 'desc' : 'asc' };
        return next;
      }

      if (shiftKey) {
        return [...prev, { key, dir: DEFAULT_SORT_DIR[key] }];
      }

      return [{ key, dir: DEFAULT_SORT_DIR[key] }];
    });
  }

  function applyOrder() {
    if (!selectedOrder) return;
    updateConfig(prev => {
      const next = {
        ...prev,
        withdrawal_priority: selectedOrder,
      };
      return {
        ...next,
        drawdown_stages: deriveDrawdownStagesFromPriority(next),
      };
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Retirement Income Strategy</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Edit drawdown stages, withdrawal order and planned pension-access/TFC events for the Current Plan shown on the Dashboard · Strategy: {getStrategyDisplayName(strategyId)}
        </p>
      </div>

      <DrawdownStagesPanel variant="editor" />

      <PensionAccessEventsPanel />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Drawdown Order Analysis
            <span className="ml-2 text-xs font-normal text-gray-400">
              {orderResult.permutations.length} permutations · click header to sort · shift+click for multi-sort
            </span>
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
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
            {selectedOrder && (
              <button
                onClick={applyOrder}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Use Selected Order in Current Plan
              </button>
            )}
          </div>
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
                      {row.depletion_age ?? <span className="text-gray-300">-</span>}
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
    </div>
  );
}
