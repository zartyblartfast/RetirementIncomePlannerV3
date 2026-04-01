import type { ProjectionSummary } from '../../engine/types';
import { Shield, AlertTriangle, PiggyBank, Landmark } from 'lucide-react';

interface Props {
  summary: ProjectionSummary;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export default function SummaryCards({ summary }: Props) {
  const {
    sustainable,
    remaining_capital,
    total_tax_paid,
    avg_effective_tax_rate,
    first_shortfall_age,
    first_pot_exhausted_age,
    end_age,
    anchor_age,
    num_years,
  } = summary;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Sustainability */}
      <div className={`rounded-lg border p-4 ${sustainable ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex items-center gap-2 mb-1">
          {sustainable
            ? <Shield className="w-5 h-5 text-green-600" />
            : <AlertTriangle className="w-5 h-5 text-red-600" />}
          <h3 className="text-sm font-medium text-gray-600">Plan Status</h3>
        </div>
        <p className={`text-xl font-bold ${sustainable ? 'text-green-700' : 'text-red-700'}`}>
          {sustainable ? 'Sustainable' : `Shortfall at ${first_shortfall_age}`}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Age {anchor_age} → {end_age} ({num_years} years)
        </p>
      </div>

      {/* Remaining Capital */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <PiggyBank className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-medium text-gray-600">Capital at {end_age}</h3>
        </div>
        <p className="text-xl font-bold text-gray-900">{fmt(remaining_capital)}</p>
        {first_pot_exhausted_age && (
          <p className="text-xs text-amber-600 mt-1">
            First pot depleted at age {first_pot_exhausted_age}
          </p>
        )}
      </div>

      {/* Total Tax */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-5 h-5 text-purple-600" />
          <h3 className="text-sm font-medium text-gray-600">Total Tax</h3>
        </div>
        <p className="text-xl font-bold text-gray-900">{fmt(total_tax_paid)}</p>
        <p className="text-xs text-gray-500 mt-1">
          Effective rate: {avg_effective_tax_rate}%
        </p>
      </div>
    </div>
  );
}
