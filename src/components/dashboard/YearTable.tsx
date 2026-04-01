import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { YearRow } from '../../engine/types';

interface Props {
  years: YearRow[];
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export default function YearTable({ years }: Props) {
  const [expandedAge, setExpandedAge] = useState<number | null>(null);

  return (
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
                        <ExpandedDetail yr={yr} />
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
  );
}

function ExpandedDetail({ yr }: { yr: YearRow }) {
  return (
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
      </div>

      {/* Tax + pot balances */}
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
        {Object.entries(yr.pot_balances).map(([name, bal]) => (
          <div key={name} className="flex justify-between text-gray-600">
            <span>{name}</span>
            <span>{fmt(bal)}</span>
          </div>
        ))}
        {Object.entries(yr.tf_balances).map(([name, bal]) => (
          <div key={name} className="flex justify-between text-gray-600">
            <span>{name}</span>
            <span>{fmt(bal)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

