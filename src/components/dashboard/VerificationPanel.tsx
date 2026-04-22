import { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { ProjectionResult } from '../../engine/types';
import { runSanityChecks } from '../../engine/sanityChecks';
import type { CheckStatus } from '../../engine/sanityChecks';

interface Props {
  result: ProjectionResult;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function statusBadgeClass(status: CheckStatus): string {
  if (status === 'pass') return 'bg-green-100 text-green-700';
  if (status === 'warn') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export default function VerificationPanel({ result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const report = runSanityChecks(result);

  const shieldColor =
    report.failCount > 0
      ? 'text-red-500'
      : report.warnCount > 0
        ? 'text-amber-500'
        : 'text-green-500';

  const badgeColor =
    report.failCount > 0
      ? 'bg-red-500'
      : report.warnCount > 0
        ? 'bg-amber-400'
        : 'bg-green-500';

  const headerText =
    report.failCount > 0
      ? 'Verification — issues found'
      : report.warnCount > 0
        ? 'Verification — warnings'
        : 'Verification — all checks passed';

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Collapsible header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className={`w-4 h-4 ${shieldColor}`} />
          <span className="text-sm font-medium text-gray-700">{headerText}</span>
          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor} text-white`}>
            {report.passCount}/{report.checks.length} passed
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="divide-y divide-gray-50">
            {report.checks.map(check => (
              <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <StatusIcon status={check.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{check.label}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusBadgeClass(check.status)}`}>
                      {check.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{check.description}</p>
                  <p className="text-xs text-gray-600 mt-1 font-mono">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              These checks re-derive key figures from their constituent parts to verify the engine is self-consistent.
              All green means every internal identity holds and the numbers can be trusted.
              This panel can be shared with a financial advisor for independent review.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
