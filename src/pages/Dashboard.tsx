import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useConfig } from '../store/configStore';
import { useProjection } from '../hooks/useProjection';
import SummaryCards from '../components/dashboard/SummaryCards';
import ProjectionChart from '../components/dashboard/ProjectionChart';
import IncomeGoalChart from '../components/dashboard/IncomeGoalChart';
import { dashboardOutcome } from '../components/dashboard/dashboardOutcome';
import { dashboardMessages } from '../components/dashboard/dashboardMessages';
import YearTable from '../components/dashboard/YearTable';
import VerificationPanel from '../components/dashboard/VerificationPanel';
import { getStrategyDisplayName } from '../engine/strategies';
import { deriveTaxContext } from '../engine/taxContext';
import ConfigPanel from '../components/dashboard/ConfigPanel';
import { dashboardHeaderLabelsForStrategy } from '../components/dashboard/dashboardHeaderLabels';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const EXTRA_YEARS = 5;

export default function Dashboard() {
  const { config } = useConfig();
  const result = useProjection(config);
  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const headerLabels = dashboardHeaderLabelsForStrategy(strategyId);
  const incomeBasis = strategyId === 'fixed_target'
    ? config.drawdown_strategy_params?.net_annual ?? config.target_income.net_annual
    : strategyId === 'vanguard_dynamic' || strategyId === 'guyton_klinger'
      ? config.drawdown_strategy_params?.initial_target ?? config.target_income.net_annual
      : config.target_income.net_annual;
  const incomeBasisLabel = strategyId === 'vanguard_dynamic' || strategyId === 'guyton_klinger'
    ? 'Initial target'
    : headerLabels.incomeLabel;
  const outcome = dashboardOutcome(result.summary, headerLabels.isPortfolioDriven);
  const messages = dashboardMessages(result);
  const taxContext = useMemo(() => deriveTaxContext(config.tax), [config.tax]);

  // Preserve the extended projection in the detailed capital/income charts only.
  const extendedConfig = useMemo(() => {
    const cfg = deepClone(config);
    (cfg as unknown as Record<string, unknown>).projection_end_age =
      cfg.personal.end_age + EXTRA_YEARS;
    return cfg;
  }, [config]);
  const chartResult = useProjection(extendedConfig);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Your retirement plan</h1>
      </header>

      <section className={`rounded-lg border-l-4 bg-white p-5 shadow-sm ${outcome.needsAttention ? 'border-amber-600' : 'border-teal-700'}`} aria-labelledby="plan-outcome">
        <p className="text-sm font-medium text-gray-600 mb-1">Plan outcome</p>
        <h2 id="plan-outcome" className="text-xl font-semibold text-gray-900">{outcome.headline}</h2>
        <p className="text-sm text-gray-600 mt-2">{outcome.explanation}</p>
      </section>

      {messages.warnings.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" aria-labelledby="plan-warnings">
          <h2 id="plan-warnings" className="text-sm font-semibold text-amber-900 mb-1">Modelling notes needing attention</h2>
          <ul className="text-sm text-amber-900 list-disc pl-5 space-y-1">
            {messages.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
          </ul>
        </section>
      )}

      <IncomeGoalChart years={result.years} firstShortfallAge={result.summary.first_shortfall_age} isPortfolioDriven={headerLabels.isPortfolioDriven} />

      {messages.milestones.length > 0 && (
        <details className="text-sm text-gray-700">
          <summary className="cursor-pointer font-medium">Pot milestones ({messages.milestones.length})</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {messages.milestones.map((message, i) => <li key={i}>{message}</li>)}
          </ul>
          <p className="mt-2 text-gray-600">A pot running out does not necessarily mean your income falls short.</p>
        </details>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700" aria-label="Current plan context">
        <span><strong>Strategy:</strong> {getStrategyDisplayName(strategyId)}</span>
        <span><strong>{incomeBasisLabel}:</strong> £{Math.round(incomeBasis).toLocaleString('en-GB')}/yr</span>
        <span><strong>Plan end:</strong> age {result.summary.end_age}</span>
        <span><strong>Tax rules:</strong> {config.tax.rule_pack_id ?? config.tax.regime}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-5">
        <Link to="/what-if" className="inline-flex rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
          Explore a change
        </Link>
        <span className="text-sm text-gray-600">Compare in What If before updating your Current Plan.</span>
      </div>

      <ConfigPanel />

      <section aria-labelledby="year-breakdown" className="space-y-3">
        <h2 id="year-breakdown" className="text-lg font-semibold text-gray-800">Year-by-Year Breakdown</h2>
        <YearTable years={result.years} taxContext={taxContext} />
      </section>

      <details className="rounded-lg border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold text-gray-800">More charts and plan statistics</summary>
        <div className="space-y-5 mt-4">
          <SummaryCards summary={result.summary} />
          <ProjectionChart years={chartResult.years} summary={result.summary} strategyName={getStrategyDisplayName(strategyId)} />
        </div>
      </details>
      <VerificationPanel result={result} />
    </div>
  );
}
