import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import type { PensionAccessResolvedEvent, YearRow } from '../../engine/types';
import type { TaxContext } from '../../engine/taxContext';
import YearWorkingsModal from '../common/YearWorkingsModal';

interface Props {
  years: YearRow[];
  taxContext?: TaxContext;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function pensionAccessEventTypeLabel(event: PensionAccessResolvedEvent): string {
  switch (event.event_type) {
    case 'tax_free_cash': return 'tax-free cash';
    case 'crystallise_and_take_pcls': return 'crystallise and take PCLS';
    case 'ufpls': return 'UFPLS';
    case 'taxable_flexi_access_drawdown': return 'taxable flexi-access drawdown';
    case 'ordinary_drawdown_marker': return 'ordinary drawdown marker';
    case 'already_taken_marker': return 'already-taken marker';
  }
}

function pensionAccessCaveatLabel(caveat: string): string {
  switch (caveat) {
    case 'foundation_only_not_applied': return 'foundation only — not applied yet';
    case 'simplified_tfc_event_no_lsa_lsdba_tracking': return 'simplified TFC event — LSA/LSDBA not tracked';
    case 'pcls_above_lsa_headroom_not_modelled': return 'PCLS / LSA warning only';
    case 'mpaa_not_triggered_pcls_only': return 'MPAA not triggered by PCLS-only crystallisation';
    case 'mpaa_triggered_by_taxable_drawdown': return 'MPAA triggered by taxable drawdown';
    case 'crystallised_balance_insufficient_for_drawdown': return 'crystallised balance insufficient for requested drawdown';
    case 'destination_inside_plan_not_yet_modelled': return 'destination caveated — inside-plan destination not yet modelled';
    case 'ordinary_drawdown_also_targets_this_pot': return 'ordinary staged withdrawals also target this pot — compatibility pro-rata treatment retained';
    default: return caveat.replace(/_/g, ' ');
  }
}

function pensionAccessEventTreatment(event: PensionAccessResolvedEvent): string {
  if (event.caveats.includes('foundation_only_not_applied')) {
    return 'Foundation only: shown for planning metadata but not applied to balances, income, or tax yet.';
  }
  if (event.event_type === 'taxable_flexi_access_drawdown') {
    return `Taxable drawdown: ${fmt(event.taxable_amount)} taxable pension income, ${fmt(event.tax_free_amount)} tax-free.`;
  }
  if (event.event_type === 'crystallise_and_take_pcls') {
    return `PCLS: ${fmt(event.tax_free_amount)} tax-free cash; ${fmt(event.gross_amount - event.tax_free_amount)} designated to crystallised drawdown.`;
  }
  return 'Capital event: not included in ordinary DC gross, taxable income, or tax.';
}

function pensionAccessLedgerMovement(event: PensionAccessResolvedEvent): string | null {
  if (
    event.uncrystallised_balance_before === undefined ||
    event.uncrystallised_balance_after === undefined ||
    event.crystallised_drawdown_balance_before === undefined ||
    event.crystallised_drawdown_balance_after === undefined
  ) {
    return null;
  }
  return `Uncrystallised ${fmt(event.uncrystallised_balance_before)} → ${fmt(event.uncrystallised_balance_after)}. Crystallised drawdown ${fmt(event.crystallised_drawdown_balance_before)} → ${fmt(event.crystallised_drawdown_balance_after)}.`;
}

function projectionWarningLabel(warning: string): string {
  switch (warning) {
    case 'ledger_aware_fad_insufficient_crystallised_balance':
      return 'Ledger-aware FAD could not fund requested ordinary withdrawals from crystallised drawdown. No automatic crystallisation or compatibility pro-rata fallback was applied.';
    default:
      return warning.replace(/_/g, ' ');
  }
}

export default function YearTable({ years, taxContext }: Props) {
  const [expandedAge, setExpandedAge] = useState<number | null>(null);
  const [workingsYear, setWorkingsYear] = useState<YearRow | null>(null);

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-8"></th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Age</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Target</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Guaranteed</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">DC Gross</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">TF</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Tax</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Net Income</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Capital</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {years.map(yr => {
                const isExpanded = expandedAge === yr.age;
                return (
                  <Fragment key={yr.age}>
                    <tr
                      className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                        yr.shortfall ? 'bg-red-50' : ''
                      }`}
                      onClick={() => setExpandedAge(isExpanded ? null : yr.age)}
                    >
                      <td className="px-3 py-2 text-gray-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{yr.age}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt(yr.target_net)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmt(yr.guaranteed_total)}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{fmt(yr.dc_withdrawal_gross)}</td>
                      <td className="px-3 py-2 text-right text-teal-700">{fmt(yr.tf_withdrawal)}</td>
                      <td className="px-3 py-2 text-right text-purple-700">{fmt(yr.tax_due)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{fmt(yr.net_income_achieved)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt(yr.total_capital)}</td>
                      <td className="px-3 py-2 text-center">
                        {yr.shortfall
                          ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Shortfall" />
                          : <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="OK" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={10} className="px-6 py-3">
                          <ExpandedDetail yr={yr} onShowWorkings={() => setWorkingsYear(yr)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {workingsYear && (
        <YearWorkingsModal
          yr={workingsYear}
          taxContext={taxContext}
          onClose={() => setWorkingsYear(null)}
        />
      )}
    </>
  );
}

function ExpandedDetail({ yr, onShowWorkings }: { yr: YearRow; onShowWorkings: () => void }) {
  const pensionAccessEvents = yr.pension_access_events ?? [];
  const projectionWarnings = yr.projection_warnings ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Guaranteed breakdown */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-1">Guaranteed Income</h4>
          {Object.entries(yr.guaranteed_income).map(([name, amount]) => (
            <div key={name} className="flex justify-between text-gray-600">
              <span>{name}</span>
              <span>{fmt(amount)}</span>
            </div>
          ))}
        </div>

        {/* Withdrawal breakdown */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-1">Pot Withdrawals (net)</h4>
          {Object.entries(yr.withdrawal_detail).map(([name, amount]) => (
            <div key={name} className="flex justify-between text-gray-600">
              <span>{name}</span>
              <span>{fmt(amount)}</span>
            </div>
          ))}
          {yr.dc_tax_free_portion > 0 && (
            <div className="flex justify-between text-gray-500 mt-1">
              <span>DC tax-free portion</span>
              <span>{fmt(yr.dc_tax_free_portion)}</span>
            </div>
          )}
          {projectionWarnings.length > 0 && (
            <div className="mt-3 rounded border border-amber-100 bg-amber-50 px-2 py-1 text-amber-800">
              <h4 className="font-semibold mb-1">Projection warnings</h4>
              <ul className="list-disc pl-4">
                {projectionWarnings.map(warning => (
                  <li key={warning}>{projectionWarningLabel(warning)}</li>
                ))}
              </ul>
            </div>
          )}
          {pensionAccessEvents.length > 0 && (
            <div className="mt-3 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-800">
              <h4 className="font-semibold mb-1">Pension access events</h4>
              {pensionAccessEvents.map(event => {
                const ledgerMovement = pensionAccessLedgerMovement(event);
                return (
                  <div key={event.id} className="space-y-0.5 text-emerald-800">
                    <div className="flex justify-between gap-2">
                      <span>{event.pot_name} {pensionAccessEventTypeLabel(event)}: {fmt(event.gross_amount)}</span>
                      <span className="text-emerald-700">month {event.month}</span>
                    </div>
                    <div className="text-emerald-700">
                      Pot balance {fmt(event.pot_balance_before)} → {fmt(event.pot_balance_after)}. {pensionAccessEventTreatment(event)}
                    </div>
                    {ledgerMovement && (
                      <div className="text-emerald-700">{ledgerMovement}</div>
                    )}
                    {event.caveats.length > 0 && (
                      <div className="text-emerald-700">
                        Caveats: {event.caveats.map(pensionAccessCaveatLabel).join('; ')}.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tax + pot balances with provenance */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-1">Tax</h4>
          <div className="flex justify-between text-gray-600">
            <span>Tax due</span>
            <span>{fmt(yr.tax_due)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Taxable income</span>
            <span>{fmt(yr.total_taxable_income)}</span>
          </div>
          <h4 className="font-semibold text-gray-700 mb-1 mt-2">Pot Balances</h4>
          {Object.entries(yr.pot_pnl).map(([name, pnl]) => (
            <div key={name} className="mb-0.5">
              <div className="flex justify-between text-gray-600">
                <span>{name}</span>
                <span>{fmt(pnl.closing)}</span>
              </div>
              <div className="flex justify-between text-gray-400 pl-2" style={{ fontSize: '0.65rem' }}>
                <span>{(pnl.provenance.rate * 100).toFixed(2)}% p.a. ({pnl.provenance.source})</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Show workings button */}
      <div className="flex justify-end">
        <button
          onClick={onShowWorkings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Calculator className="w-3.5 h-3.5" />
          Show full workings
        </button>
      </div>
    </div>
  );
}
