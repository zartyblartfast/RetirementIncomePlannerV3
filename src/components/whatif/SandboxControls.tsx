/**
 * SandboxControls — compact parameter panel for What If exploration.
 *
 * Edits a local config copy; does NOT touch the dashboard config.
 * Only exposes the "what if" levers: strategy choice, CPI, retirement timing,
 * end age, strategy-specific params, and a scenario-only TFC lever. The staged
 * drawdown/blending strategy is shown as a read-only Current Plan baseline.
 */

import { STRATEGIES, STRATEGY_IDS } from '../../engine/strategies';
import type { PensionAccessEventAmount, PlannerConfig } from '../../engine/types';
import { deriveRetirementAge, retirementDateForAge } from '../../engine/dateUtils';
import { deriveDrawdownStagesFromPriority } from '../../engine/drawdownStages';
import { formatDrawdownStrategySummary } from '../dashboard/drawdownStageSummary';
import {
  formatSandboxTfcAmount,
  pensionAccessScenarioMode,
  setRetirementTfcScenario,
  updateSandboxTfcAmount,
  updateSandboxTfcPot,
} from './pensionAccessSandbox';

interface Props {
  config: PlannerConfig;
  onChange: (cfg: PlannerConfig) => void;
}

export default function SandboxControls({ config, onChange }: Props) {
  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const strategyDef = STRATEGIES[strategyId];
  const strategyParams = config.drawdown_strategy_params ?? {};
  const pensionAccessMode = pensionAccessScenarioMode(config);
  const sandboxTfcEvent = config.pension_access_events?.find(event => event.id === 'sandbox_retirement_tfc');
  const sandboxTfcAmount = sandboxTfcEvent?.amount ?? { kind: 'percentage_of_estimated_tfc_remaining' as const, value: 1 };
  const sandboxTfcPotRef = sandboxTfcEvent?.pot_ref ?? config.dc_pots[0]?.name ?? '';
  const selectedTfcPot = config.dc_pots.find(pot => pot.name === sandboxTfcPotRef);
  const sandboxTfcPotLabel = selectedTfcPot?.name ?? sandboxTfcPotRef;
  const retirementAge = deriveRetirementAge(
    config.personal.date_of_birth,
    config.personal.retirement_date,
  );

  function patch(updater: (draft: PlannerConfig) => void) {
    const next: PlannerConfig = JSON.parse(JSON.stringify(config));
    updater(next);
    onChange(next);
  }

  function setStrategyParam(key: string, val: number) {
    patch(c => {
      if (!c.drawdown_strategy_params) c.drawdown_strategy_params = {};
      c.drawdown_strategy_params[key] = val;
      if (key === 'net_annual' || key === 'initial_target') {
        c.target_income.net_annual = val;
      }
    });
  }

  const strategyStages = Array.isArray(config.drawdown_stages)
    ? config.drawdown_stages
    : deriveDrawdownStagesFromPriority(config);
  const strategySummary = formatDrawdownStrategySummary(strategyStages);

  function setSandboxTfcAmountKind(kind: PensionAccessEventAmount['kind']) {
    const amount: PensionAccessEventAmount = kind === 'fixed_amount'
      ? { kind: 'fixed_amount', value: 10000 }
      : kind === 'percentage_of_pot'
        ? { kind: 'percentage_of_pot', value: 0.25 }
        : { kind: 'percentage_of_estimated_tfc_remaining', value: 1 };
    onChange(updateSandboxTfcAmount(config, amount));
  }

  function setSandboxTfcAmountValue(value: number) {
    const amount: PensionAccessEventAmount = sandboxTfcAmount.kind === 'fixed_amount'
      ? { kind: 'fixed_amount', value }
      : { kind: sandboxTfcAmount.kind, value: value / 100 };
    onChange(updateSandboxTfcAmount(config, amount));
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Strategy + core params */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Field label="Strategy">
          <select
            value={strategyId}
            onChange={e => {
              const newId = e.target.value;
              const newDef = STRATEGIES[newId];
              const defaults: Record<string, number> = {};
              if (newDef) {
                for (const p of newDef.params) defaults[p.key] = p.default;
              }
              // Seed initial_target / net_annual from current target income
              if (newId === 'fixed_target') {
                defaults.net_annual = config.target_income.net_annual;
              } else if (newId === 'vanguard_dynamic' || newId === 'guyton_klinger') {
                defaults.initial_target = config.target_income.net_annual;
              }
              patch(c => {
                c.drawdown_strategy = newId;
                c.drawdown_strategy_params = defaults;
              });
            }}
            className="input-field"
          >
            {STRATEGY_IDS.map(id => (
              <option key={id} value={id}>{STRATEGIES[id]!.display_name}</option>
            ))}
          </select>
        </Field>

        <Field label="CPI (%)">
          <input
            type="number"
            value={(config.target_income.cpi_rate * 100).toFixed(1)}
            step={0.1}
            onChange={e => patch(c => { c.target_income.cpi_rate = Number(e.target.value) / 100; })}
            className="input-field"
          />
        </Field>

        <Field label="Retire Age">
          <input
            type="number"
            value={retirementAge}
            step={1}
            min={50}
            max={80}
            onChange={e => patch(c => {
              c.personal.retirement_date = retirementDateForAge(
                c.personal.date_of_birth,
                Number(e.target.value),
              );
            })}
            className="input-field"
          />
        </Field>

        <Field label="End Age">
          <input
            type="number"
            value={config.personal.end_age}
            step={1}
            min={70}
            max={120}
            onChange={e => patch(c => { c.personal.end_age = Number(e.target.value); })}
            className="input-field"
          />
        </Field>
      </div>

      {/* Row 2: Strategy-specific params */}
      {strategyDef && strategyDef.params.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {strategyDef.params
            .filter(p => !p.sandbox_hidden)
            .map(p => (
              <Field key={p.key} label={p.label} tooltip={p.tooltip}>
                <input
                  type="number"
                  value={strategyParams[p.key] ?? p.default}
                  step={p.step}
                  onChange={e => setStrategyParam(p.key, Number(e.target.value))}
                  className="input-field"
                />
              </Field>
            ))}
        </div>
      )}

      {/* Row 3: strategy snapshot, read-only in What If */}
      <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <p className="font-semibold">Retirement Income Strategy baseline</p>
        <p className="mt-1">
          What If starts from the Current Plan strategy. Edit stages, order and blending on the Strategy page; use the controls here for scenario levers only.
        </p>
        <p className="mt-1 text-blue-800">
          {strategySummary}
        </p>
      </div>

      {/* Row 4: Pension access / tax-free cash scenario lever */}
      <div className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Field label="Tax-free cash event" tooltip="Scenario-only lever. Adds or removes a retirement-date pension access event from this sandbox copy without changing the Current Plan shown on the Dashboard.">
            <select
              value={pensionAccessMode}
              onChange={e => onChange(setRetirementTfcScenario(config, e.target.value === 'retirement_tfc'))}
              disabled={config.dc_pots.length === 0}
              className="input-field disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="none">None / ordinary drawdown only</option>
              <option value="retirement_tfc">Take TFC at retirement date</option>
            </select>
          </Field>
          {sandboxTfcEvent && (
            <>
              <Field label="Pension pot" tooltip="The selected DC pension pot that this scenario-only tax-free cash event is taken from.">
                <select
                  value={sandboxTfcPotRef}
                  onChange={e => onChange(updateSandboxTfcPot(config, e.target.value))}
                  className="input-field"
                >
                  {config.dc_pots.map(pot => (
                    <option key={pot.name} value={pot.name}>{pot.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="TFC amount basis">
                <select
                  value={sandboxTfcAmount.kind}
                  onChange={e => setSandboxTfcAmountKind(e.target.value as PensionAccessEventAmount['kind'])}
                  className="input-field"
                >
                  <option value="percentage_of_estimated_tfc_remaining">% of estimated remaining TFC</option>
                  <option value="percentage_of_pot">% of pension pot</option>
                  <option value="fixed_amount">Fixed amount</option>
                </select>
              </Field>
              <Field label={sandboxTfcAmount.kind === 'fixed_amount' ? 'TFC amount (£)' : 'TFC percentage (%)'}>
                <input
                  type="number"
                  min={0}
                  step={sandboxTfcAmount.kind === 'fixed_amount' ? 100 : 0.1}
                  value={sandboxTfcAmount.kind === 'fixed_amount' ? sandboxTfcAmount.value : sandboxTfcAmount.value * 100}
                  onChange={e => setSandboxTfcAmountValue(Number(e.target.value))}
                  className="input-field"
                />
              </Field>
            </>
          )}
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-emerald-800">
          <p>
            {sandboxTfcEvent
              ? `Scenario includes ${formatSandboxTfcAmount(sandboxTfcAmount)} from ${sandboxTfcPotLabel} as a separate pension-access capital event at retirement. Compare saved variants to see pot-balance effects; it is not ordinary income or taxable drawdown.`
              : 'Use this to compare no separate TFC event against a retirement-date TFC variant. Saved scenarios keep their own sandbox event settings.'}
          </p>
          {sandboxTfcEvent && (
            <p className="rounded border border-emerald-200 bg-white/60 px-2 py-1">
              <span className="font-medium">Currently modelled as pot reduction only.</span>{' '}
              Released cash is not yet added to a modelled cash, ISA, or other destination account.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, tooltip, children }: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600" title={tooltip}>
        {label}
      </span>
      {children}
    </label>
  );
}
