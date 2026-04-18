/**
 * SandboxControls — compact parameter panel for What If exploration.
 *
 * Edits a local config copy; does NOT touch the dashboard config.
 * Only exposes the "what if" levers: strategy, drawdown order, CPI,
 * retirement age, end age, and strategy-specific params.
 */

import { ChevronUp, ChevronDown } from 'lucide-react';
import { STRATEGIES, STRATEGY_IDS } from '../../engine/strategies';
import type { PlannerConfig } from '../../engine/types';

interface Props {
  config: PlannerConfig;
  onChange: (cfg: PlannerConfig) => void;
}

export default function SandboxControls({ config, onChange }: Props) {
  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const strategyDef = STRATEGIES[strategyId];
  const strategyParams = config.drawdown_strategy_params ?? {};

  function patch(updater: (draft: PlannerConfig) => void) {
    const next: PlannerConfig = JSON.parse(JSON.stringify(config));
    updater(next);
    onChange(next);
  }

  function setStrategyParam(key: string, val: number) {
    patch(c => {
      if (!c.drawdown_strategy_params) c.drawdown_strategy_params = {};
      c.drawdown_strategy_params[key] = val;
    });
  }

  function swapOrder(i: number, j: number) {
    patch(c => {
      const arr = c.withdrawal_priority;
      [arr[i]!, arr[j]!] = [arr[j]!, arr[i]!];
    });
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
              // Seed end_age for ARVA
              if (newId === 'arva' || newId === 'arva_guardrails') {
                defaults.target_end_age = config.personal.end_age;
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
            value={config.personal.retirement_age ?? 68}
            step={1}
            min={50}
            max={80}
            onChange={e => patch(c => { c.personal.retirement_age = Number(e.target.value); })}
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
