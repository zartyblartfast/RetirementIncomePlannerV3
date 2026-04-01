import { useState } from 'react';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useConfig } from '../../store/configStore';
import { STRATEGIES, STRATEGY_IDS } from '../../engine/strategies';
import type { PlannerConfig } from '../../engine/types';

export default function ConfigPanel() {
  const { config, updateConfig } = useConfig();
  const [open, setOpen] = useState(true);

  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const strategyDef = STRATEGIES[strategyId];
  const strategyParams = config.drawdown_strategy_params ?? {};

  function setNested(path: string, val: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const parts = path.split('.');
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]!] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]!] = val;
      return next;
    });
  }

  function setStrategyParam(key: string, val: number) {
    updateConfig(prev => ({
      ...prev,
      drawdown_strategy_params: { ...prev.drawdown_strategy_params, [key]: val },
    }));
  }

  function setPotBalance(type: 'dc' | 'tf', index: number, val: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      if (type === 'dc') {
        next.dc_pots[index]!.starting_balance = val;
      } else {
        next.tax_free_accounts[index]!.starting_balance = val;
      }
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Configuration</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
          {/* Row 1: Income + Strategy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Target Net Income (£/yr)">
              <input
                type="number"
                value={config.target_income.net_annual}
                step={500}
                onChange={e => setNested('target_income.net_annual', Number(e.target.value))}
                className="input-field"
              />
            </Field>

            <Field label="CPI Rate (%)">
              <input
                type="number"
                value={(config.target_income.cpi_rate * 100).toFixed(1)}
                step={0.1}
                onChange={e => setNested('target_income.cpi_rate', Number(e.target.value) / 100)}
                className="input-field"
              />
            </Field>

            <Field label="End Age">
              <input
                type="number"
                value={config.personal.end_age}
                step={1}
                min={60}
                max={120}
                onChange={e => setNested('personal.end_age', Number(e.target.value))}
                className="input-field"
              />
            </Field>

            <Field label="Drawdown Strategy">
              <select
                value={strategyId}
                onChange={e => {
                  const newId = e.target.value;
                  const newDef = STRATEGIES[newId];
                  const defaults: Record<string, number> = {};
                  if (newDef) {
                    for (const p of newDef.params) {
                      defaults[p.key] = p.default;
                    }
                  }
                  updateConfig(prev => ({
                    ...prev,
                    drawdown_strategy: newId,
                    drawdown_strategy_params: defaults,
                  }));
                }}
                className="input-field"
              >
                {STRATEGY_IDS.map(id => (
                  <option key={id} value={id}>{STRATEGIES[id]!.display_name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Strategy params */}
          {strategyDef && strategyDef.params.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {strategyDef.display_name} Parameters
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            </div>
          )}

          {/* Pot balances */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Pot Balances
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {config.dc_pots.map((pot, i) => (
                <Field key={pot.name} label={pot.name}>
                  <input
                    type="number"
                    value={pot.starting_balance}
                    step={1000}
                    onChange={e => setPotBalance('dc', i, Number(e.target.value))}
                    className="input-field"
                  />
                </Field>
              ))}
              {config.tax_free_accounts.map((acc, i) => (
                <Field key={acc.name} label={acc.name}>
                  <input
                    type="number"
                    value={acc.starting_balance}
                    step={1000}
                    onChange={e => setPotBalance('tf', i, Number(e.target.value))}
                    className="input-field"
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>
      )}
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
