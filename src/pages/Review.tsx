import { useState, useCallback, useMemo } from 'react';
import { Lock, Unlock, Plus, Trash2, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useConfig } from '../store/configStore';
import { useProjection } from '../hooks/useProjection';
import {
  loadReviewStore,
  lockBaseline,
  clearBaseline,
  addReview,
  deleteReview,
  getLatestReview,
  monthsSinceLastReview,
} from '../store/reviewStore';
import type { ReviewStore, ReviewSnapshot } from '../store/reviewStore';
import type { PlannerConfig } from '../engine/types';
import { getStrategyDisplayName } from '../engine/strategies';
import ReviewCharts from '../components/review/ReviewCharts';

// ── Helpers ──────────────────────────────────────────────────────────

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function formatDate(ym: string): string {
  const [y, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m) - 1]} ${y}`;
}

function isRetired(config: PlannerConfig): boolean {
  const [retY, retM] = config.personal.retirement_date.split('-').map(Number) as [number, number];
  const now = new Date();
  const retDate = new Date(retY, retM - 1);
  return now >= retDate;
}

// ── Main component ───────────────────────────────────────────────────

export default function Review() {
  const { config, updateConfig } = useConfig();
  const [store, setStore] = useState<ReviewStore>(() => loadReviewStore());
  const retired = isRetired(config);

  // ── Form state for new review ────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(currentYM);
  const [formBalances, setFormBalances] = useState<Record<string, string>>({});
  const [formIncome, setFormIncome] = useState<Record<string, string>>({});
  const [formGuarMonthly, setFormGuarMonthly] = useState<Record<string, string>>({});
  const [formNotes, setFormNotes] = useState('');

  // All pot/account/guaranteed names from config
  const dcNames = config.dc_pots.map(p => p.name);
  const tfNames = config.tax_free_accounts.map(a => a.name);
  const allPotNames = [...dcNames, ...tfNames];
  const guaranteedNames = config.guaranteed_income.map(g => g.name);

  // ── Review reminder ──────────────────────────────────────────────
  const monthsElapsed = monthsSinceLastReview(store);
  const latestReview = getLatestReview(store);

  // Context label for the new-review form: "Since previous review: Mar 2027 (3 months)"
  const prevReviewContext = useMemo(() => {
    if (store.reviews.length === 0) return null;
    // Find the most recent review strictly before formDate
    const prior = [...store.reviews].reverse().find(r => r.date < formDate);
    if (!prior) return null;
    const [py, pm] = prior.date.split('-').map(Number) as [number, number];
    const [fy, fm] = formDate.split('-').map(Number) as [number, number];
    const gap = (fy - py) * 12 + (fm - pm);
    return { date: prior.date, months: gap };
  }, [store.reviews, formDate]);

  // ── Retirement age (for chart reference line) ──────────────────
  const retirementAge = useMemo(() => {
    const [dy, dm] = config.personal.date_of_birth.split('-').map(Number) as [number, number];
    const [ry, rm] = config.personal.retirement_date.split('-').map(Number) as [number, number];
    return Math.floor(((ry * 12 + rm) - (dy * 12 + dm)) / 12);
  }, [config.personal.date_of_birth, config.personal.retirement_date]);

  // ── Strategy change detection ──────────────────────────────────
  const baselineStrategy = store.baseline_config?.drawdown_strategy ?? null;
  const currentStrategy = config.drawdown_strategy ?? 'fixed_target';
  const strategyChanged = store.baseline_config !== null && baselineStrategy !== currentStrategy;

  // ── Baseline projection (for variance) ───────────────────────────
  const baselineResult = useProjection(store.baseline_config ?? config);
  const currentResult = useProjection(config);

  // Actual capital from latest review (used in both modes)
  const actualCapital = latestReview
    ? Object.values(latestReview.pot_balances).reduce((s, v) => s + v, 0)
    : null;

  // ── Variance summary (only when strategy unchanged) ──────────────
  const variance = useMemo(() => {
    if (!store.baseline_config || !latestReview || strategyChanged) return null;

    // Current age from latest review date
    const [dobY, dobM] = config.personal.date_of_birth.split('-').map(Number) as [number, number];
    const [revY, revM] = latestReview.date.split('-').map(Number) as [number, number];
    const reviewAge = Math.floor(((revY * 12 + revM) - (dobY * 12 + dobM)) / 12);

    // Find planned capital at review age
    const plannedYear = baselineResult.years.find(y => y.age === reviewAge);
    const plannedCapital = plannedYear?.total_capital ?? 0;

    // Actual capital from review
    const actualCapital = Object.values(latestReview.pot_balances).reduce((s, v) => s + v, 0);

    const capitalDiff = actualCapital - plannedCapital;
    const capitalDiffPct = plannedCapital > 0 ? Math.round((capitalDiff / plannedCapital) * 100) : 0;

    return {
      reviewAge,
      plannedCapital,
      actualCapital,
      capitalDiff,
      capitalDiffPct,
      onTrack: capitalDiff >= 0,
    };
  }, [store.baseline_config, latestReview, strategyChanged, baselineResult.years, config.personal.date_of_birth]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleLockBaseline = useCallback(() => {
    setStore(lockBaseline(config));
  }, [config]);

  const handleClearBaseline = useCallback(() => {
    if (window.confirm('Reset baseline? This removes your plan reference point.')) {
      setStore(clearBaseline());
    }
  }, []);

  const handleRebaseline = useCallback(() => {
    setStore(lockBaseline(config));
  }, [config]);

  const openNewReview = useCallback(() => {
    // Pre-populate balances from current config
    const bals: Record<string, string> = {};
    for (const pot of config.dc_pots) bals[pot.name] = String(Math.round(pot.starting_balance));
    for (const acc of config.tax_free_accounts) bals[acc.name] = String(Math.round(acc.starting_balance));
    setFormBalances(bals);

    const inc: Record<string, string> = {};
    for (const name of [...dcNames, ...tfNames]) inc[name] = '0';
    setFormIncome(inc);

    const guar: Record<string, string> = {};
    for (const g of config.guaranteed_income) guar[g.name] = String(Math.round(g.gross_annual / 12));
    setFormGuarMonthly(guar);

    setFormDate(currentYM());
    setFormNotes('');
    setShowForm(true);
  }, [config, dcNames, tfNames]);

  const handleSaveReview = useCallback(() => {
    const potBals: Record<string, number> = {};
    for (const [k, v] of Object.entries(formBalances)) potBals[k] = Number(v) || 0;

    const incDrawn: Record<string, number> = {};
    for (const [k, v] of Object.entries(formIncome)) incDrawn[k] = Number(v) || 0;

    const guarMonthly: Record<string, number> = {};
    for (const [k, v] of Object.entries(formGuarMonthly)) guarMonthly[k] = Number(v) || 0;

    const newStore = addReview({
      date: formDate,
      pot_balances: potBals,
      income_since_last: incDrawn,
      guaranteed_monthly: guarMonthly,
      strategy: config.drawdown_strategy ?? 'fixed_target',
      strategy_params: { ...(config.drawdown_strategy_params ?? {}) },
      notes: formNotes,
    });
    setStore(newStore);

    // Sync config store with latest review balances
    updateConfig(prev => {
      const next: PlannerConfig = JSON.parse(JSON.stringify(prev));
      for (const pot of next.dc_pots) {
        if (potBals[pot.name] !== undefined) {
          pot.starting_balance = potBals[pot.name]!;
          pot.values_as_of = formDate;
        }
      }
      for (const acc of next.tax_free_accounts) {
        if (potBals[acc.name] !== undefined) {
          acc.starting_balance = potBals[acc.name]!;
          acc.values_as_of = formDate;
        }
      }
      return next;
    });

    setShowForm(false);
  }, [formDate, formBalances, formIncome, formGuarMonthly, formNotes, updateConfig]);

  const handleDeleteReview = useCallback((id: string) => {
    if (window.confirm('Delete this review?')) {
      setStore(deleteReview(id));
    }
  }, []);

  // ── Pre-retirement guard ─────────────────────────────────────────
  if (!retired) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track actual outcomes against your plan</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            Review tracking begins at retirement.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Your retirement date is <span className="font-medium">{formatDate(config.personal.retirement_date)}</span>.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track actual outcomes against your plan</p>
      </div>

      {/* Review reminder */}
      {monthsElapsed !== null && monthsElapsed >= 3 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {monthsElapsed} month{monthsElapsed !== 1 ? 's' : ''} since your last review
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Last reviewed: {latestReview ? formatDate(latestReview.date) : 'baseline set'}
            </p>
          </div>
        </div>
      )}

      {/* Baseline section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              {store.baseline_config ? <Lock className="w-3.5 h-3.5 text-green-600" /> : <Unlock className="w-3.5 h-3.5 text-gray-400" />}
              Plan Baseline
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {store.baseline_config
                ? `Locked ${store.baseline_locked_date ? formatDate(store.baseline_locked_date.slice(0, 7)) : ''} — this is your reference projection`
                : 'Lock your current plan as the reference point for future comparisons'}
            </p>
          </div>
          <div className="flex gap-2">
            {store.baseline_config ? (
              <button
                onClick={handleClearBaseline}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                <Unlock className="w-3.5 h-3.5" /> Reset Baseline
              </button>
            ) : (
              <button
                onClick={handleLockBaseline}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                <Lock className="w-3.5 h-3.5" /> Lock Current Plan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Strategy change banner */}
      {strategyChanged && store.baseline_config && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                Strategy changed: {getStrategyDisplayName(baselineStrategy ?? 'fixed_target')} → {getStrategyDisplayName(currentStrategy)}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Plan-vs-actual comparison is paused because the strategies have different income profiles.
                History below shows your actual pot balances and income drawn.
              </p>
            </div>
          </div>
          <button
            onClick={handleRebaseline}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Lock className="w-3.5 h-3.5" /> Re-baseline with Current Plan
          </button>
        </div>
      )}

      {/* Simplified summary when strategy changed */}
      {strategyChanged && actualCapital !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard label="Actual Capital" value={fmt(actualCapital)} highlight />
          <MetricCard label="Current Strategy" value={getStrategyDisplayName(currentStrategy)} />
          <MetricCard
            label="Status"
            value={currentResult.summary.sustainable ? 'Sustainable' : `Shortfall at ${currentResult.summary.first_shortfall_age}`}
            positive={currentResult.summary.sustainable}
          />
        </div>
      )}

      {/* Full variance summary (strategy unchanged) */}
      {variance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Planned Capital" value={fmt(variance.plannedCapital)} sub={`at age ${variance.reviewAge}`} />
          <MetricCard label="Actual Capital" value={fmt(variance.actualCapital)} highlight />
          <MetricCard
            label="Variance"
            value={`${variance.capitalDiff >= 0 ? '+' : ''}${fmt(variance.capitalDiff)}`}
            sub={`${variance.capitalDiffPct >= 0 ? '+' : ''}${variance.capitalDiffPct}%`}
            positive={variance.onTrack}
          />
          <MetricCard
            label="Status"
            value={currentResult.summary.sustainable ? 'Sustainable' : `Shortfall at ${currentResult.summary.first_shortfall_age}`}
            positive={currentResult.summary.sustainable}
          />
        </div>
      )}

      {/* Charts — show when baseline exists or reviews exist */}
      {(store.baseline_config || store.reviews.length > 0) && (
        <ReviewCharts
          baselineYears={baselineResult.years}
          currentYears={currentResult.years}
          reviews={store.reviews}
          dobYM={config.personal.date_of_birth}
          retirementAge={retirementAge}
          strategyChanged={strategyChanged}
        />
      )}

      {/* New review button / form */}
      {!showForm ? (
        <button
          onClick={openNewReview}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New Review
        </button>
      ) : (
        <div className="bg-white rounded-lg border border-blue-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">New Review</h3>
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Review Date</span>
              <input
                type="month"
                value={formDate}
                max={currentYM()}
                onChange={e => setFormDate(e.target.value)}
                className="input-field"
              />
            </label>
            {prevReviewContext && (
              <p className="text-xs text-gray-500 self-end pb-1.5">
                Since previous review: <span className="font-medium">{formatDate(prevReviewContext.date)}</span>{' '}
                ({prevReviewContext.months} month{prevReviewContext.months !== 1 ? 's' : ''})
              </p>
            )}
          </div>

          {/* Pot balances */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Pot Balances</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {allPotNames.map(name => (
                <label key={name} className="block">
                  <span className="text-xs font-medium text-gray-600">{name}</span>
                  <input
                    type="number"
                    value={formBalances[name] ?? '0'}
                    step={100}
                    onChange={e => setFormBalances(prev => ({ ...prev, [name]: e.target.value }))}
                    className="input-field"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Net income drawn since last review */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Net Income Drawn Since Last Review</h4>
            <p className="text-xs text-gray-400 mb-2">Amount received after tax — what reached your bank account</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {allPotNames.map(name => (
                <label key={name} className="block">
                  <span className="text-xs font-medium text-gray-600">{name} (£ net)</span>
                  <input
                    type="number"
                    value={formIncome[name] ?? '0'}
                    step={100}
                    onChange={e => setFormIncome(prev => ({ ...prev, [name]: e.target.value }))}
                    className="input-field"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Guaranteed income — current monthly amounts */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Current Monthly Guaranteed Income</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {guaranteedNames.map(name => (
                <label key={name} className="block">
                  <span className="text-xs font-medium text-gray-600">{name} (£/month)</span>
                  <input
                    type="number"
                    value={formGuarMonthly[name] ?? '0'}
                    step={10}
                    onChange={e => setFormGuarMonthly(prev => ({ ...prev, [name]: e.target.value }))}
                    className="input-field"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Notes (optional)</span>
            <input
              type="text"
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="e.g. Market correction, one-off expense..."
              className="input-field"
            />
          </label>

          {/* Save */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveReview}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Save Review
            </button>
          </div>
        </div>
      )}

      {/* Review history */}
      {store.reviews.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Review History</h2>
            <p className="text-xs text-gray-500">{store.reviews.length} review{store.reviews.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <div className="divide-y divide-gray-100">
            {[...store.reviews].reverse().map(rev => (
              <ReviewRow key={rev.id} review={rev} onDelete={handleDeleteReview} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function MetricCard({ label, value, sub, highlight, positive }: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${
        highlight ? 'text-blue-700' :
        positive !== undefined ? (positive ? 'text-green-700' : 'text-red-600') :
        'text-gray-900'
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ReviewRow({ review, onDelete }: { review: ReviewSnapshot; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const totalCapital = Object.values(review.pot_balances).reduce((s, v) => s + v, 0);
  const totalIncome = Object.values(review.income_since_last).reduce((s, v) => s + v, 0);

  return (
    <div>
      <div
        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          <span className="text-sm font-medium text-gray-700">{formatDate(review.date)}</span>
          <span className="text-xs text-gray-500">Capital: {fmt(totalCapital)}</span>
          {totalIncome > 0 && <span className="text-xs text-gray-500">Income: {fmt(totalIncome)}</span>}
          {review.strategy && <span className="text-xs text-gray-400">{getStrategyDisplayName(review.strategy)}</span>}
          {review.notes && <span className="text-xs text-gray-400 italic truncate max-w-[200px]">{review.notes}</span>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(review.id); }}
          className="p-1 text-gray-300 hover:text-red-500"
          title="Delete review"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {Object.keys(review.pot_balances).length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Pot Balances</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(review.pot_balances).map(([name, val]) => (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-600">{name}</span>
                    <span className="text-gray-900 font-medium tabular-nums">{fmt(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.values(review.income_since_last).some(v => v > 0) && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Net Income Drawn</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(review.income_since_last).filter(([, v]) => v > 0).map(([name, val]) => (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-600">{name}</span>
                    <span className="text-gray-900 font-medium tabular-nums">{fmt(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.values(review.guaranteed_monthly).some(v => v > 0) && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Monthly Guaranteed Income</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(review.guaranteed_monthly).filter(([, v]) => v > 0).map(([name, val]) => (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-600">{name}</span>
                    <span className="text-gray-900 font-medium tabular-nums">{fmt(val)}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
