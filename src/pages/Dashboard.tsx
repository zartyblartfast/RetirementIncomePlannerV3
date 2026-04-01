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
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
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
        {result.warnings.length > 0 && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

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
