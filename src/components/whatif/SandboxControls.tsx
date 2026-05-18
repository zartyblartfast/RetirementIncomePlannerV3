/**
 * SandboxControls — compact parameter panel for What If exploration.
 *
 * Edits a local config copy; does NOT touch the dashboard config.
 * Only exposes the "what if" levers: strategy, drawdown order, CPI,
 * retirement age, end age, and strategy-specific params.
 */

import { ChevronUp, ChevronDown } from 'lucide-react';
import { STRATEGIES, STRATEGY_IDS } from '../../engine/strategies';
import type { PensionAccessEventAmount, PlannerConfig } from '../../engine/types';
import { deriveRetirementAge, retirementDateForAge } from '../../engine/dateUtils';
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

  function swapOrder(i: number, j: number) {
    patch(c => {
      const arr = c.withdrawal_priority;
      [arr[i]!, arr[j]!] = [arr[j]!, arr[i]!];
    });
  }

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

      {/* Row 3: Withdrawal order (compact inline) */}
      <div>
        <span className="text-xs font-medium text-gray-600 mr-2">Drawdown Order:</span>
        <div className="inline-flex items-center gap-1 flex-wrap">
          {config.withdrawal_priority.map((name, i) => (
            <span key={name} className="inline-flex items-center gap-0.5 bg-gray-100 rounded px-2 py-1 text-xs text-gray-700">
              <span className="font-medium text-gray-400 mr-0.5">{i + 1}.</span>
              {name}
              <button
                disabled={i === 0}
                onClick={() => swapOrder(i, i - 1)}
                className="p-0 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={i === config.withdrawal_priority.length - 1}
                onClick={() => swapOrder(i, i + 1)}
                className="p-0 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {i < config.withdrawal_priority.length - 1 && (
                <span className="text-gray-300 ml-0.5">→</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Row 4: Pension access / tax-free cash scenario lever */}
      <div className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Field label="Tax-free cash event" tooltip="Scenario-only lever. Adds or removes a retirement-date pension access event from this sandbox copy without changing dashboard settings.">
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
        <p className="mt-2 text-[11px] text-emerald-800">
          {sandboxTfcEvent
            ? `Scenario includes ${formatSandboxTfcAmount(sandboxTfcAmount)} from ${sandboxTfcPotLabel} as a separate pension-access capital event at retirement. Compare saved variants to see pot-balance effects; it is not ordinary income or taxable drawdown.`
            : 'Use this to compare no separate TFC event against a retirement-date TFC variant. Saved scenarios keep their own sandbox event settings.'}
        </p>
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
