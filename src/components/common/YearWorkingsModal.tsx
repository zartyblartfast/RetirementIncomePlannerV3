import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { YearRow } from '../../engine/types';
import { computeYearWorkings } from '../../engine/workings';

interface Props {
  yr: YearRow;
  onClose: () => void;
}

function fmtGBP(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export default function YearWorkingsModal({ yr, onClose }: Props) {
  const report = computeYearWorkings(yr);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Calculation workings — Age {report.age}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Tax year {report.taxYear}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto px-5 py-4 space-y-2 flex-1">
          {report.steps.map(step => {
            const hasFail = step.isCrossCheck && step.delta !== undefined && step.delta > 1;
            const hasPass = step.isCrossCheck && step.delta !== undefined && step.delta <= 1;

            return (
              <div
                key={step.id}
                className={`rounded-lg border px-4 py-3 ${
                  hasFail
                    ? 'border-red-200 bg-red-50'
                    : hasPass
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {hasFail && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      {hasPass && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      <span className="text-sm font-medium text-gray-800">{step.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 break-words leading-relaxed">
                      {step.formula}
                    </p>
                    {step.isCrossCheck && step.delta !== undefined && (
                      <p className={`text-xs mt-1 font-medium ${hasFail ? 'text-red-600' : 'text-green-600'}`}>
                        {hasFail
                          ? `✗ Discrepancy: ${fmtGBP(step.delta)}`
                          : '✓ Verified'}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-mono font-semibold text-gray-900 shrink-0 tabular-nums">
                    {fmtGBP(step.value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-400">
            All figures are annual. Growth and fees are computed monthly then aggregated.
            Green cross-check rows re-derive the value from constituent parts — a tick means the arithmetic is exact.
          </p>
        </div>
      </div>
    </div>
  );
}
