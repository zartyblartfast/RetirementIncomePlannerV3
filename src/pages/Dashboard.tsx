import { useConfig } from '../store/configStore';
import { useProjection } from '../hooks/useProjection';
import SummaryCards from '../components/dashboard/SummaryCards';
import ProjectionChart from '../components/dashboard/ProjectionChart';
import YearTable from '../components/dashboard/YearTable';
import { getStrategyDisplayName } from '../engine/strategies';
import ConfigPanel from '../components/dashboard/ConfigPanel';

export default function Dashboard() {
  const { config } = useConfig();
  const result = useProjection(config);
  const strategyId = config.drawdown_strategy ?? 'fixed_target';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          Strategy: <span className="font-medium text-gray-700">{getStrategyDisplayName(strategyId)}</span>
          {' · '}Target: <span className="font-medium text-gray-700">
            £{Math.round(config.target_income.net_annual).toLocaleString('en-GB')}/yr
          </span>
          {' · '}CPI: <span className="font-medium text-gray-700">
            {(config.target_income.cpi_rate * 100).toFixed(1)}%
          </span>
        </p>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <h3 className="text-sm font-medium text-amber-800 mb-1">Warnings</h3>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {result.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Config editing */}
      <ConfigPanel />

      {/* Summary cards */}
      <SummaryCards summary={result.summary} />

      {/* Charts */}
      <ProjectionChart years={result.years} />

      {/* Year-by-year table */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Year-by-Year Breakdown</h2>
        <YearTable years={result.years} />
      </div>
    </div>
  );
}
