import { ExternalLink, ShieldCheck } from 'lucide-react';
import type { TaxContext } from '../../engine/taxContext';

interface Props {
  context: TaxContext;
  compact?: boolean;
}

export default function TaxContextSummary({ context, compact = false }: Props) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-slate-50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-slate-800">Tax Assumptions</h3>
            <span className="text-xs font-medium text-slate-500">{context.statusLabel}</span>
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Regime</dt>
              <dd className="font-medium text-slate-800">{context.regimeLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tax year</dt>
              <dd className="font-medium text-slate-800">{context.taxYear}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last checked</dt>
              <dd className="font-medium text-slate-800">{context.lastCheckedDate}</dd>
            </div>
          </dl>

          <div className="mt-3 space-y-2 text-xs">
            <div>
              <p className="font-medium text-slate-600">Official sources</p>
              {context.sources.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {context.sources.map(source => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800"
                      >
                        <span>{source.name}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-slate-500">No official source URLs recorded.</p>
              )}
            </div>

            {!compact && (
              <div>
                <p className="font-medium text-slate-600">Known exclusions / limitations</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                  {context.knownExclusions.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
