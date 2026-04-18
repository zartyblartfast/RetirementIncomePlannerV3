import { useState } from 'react';
import { Settings, ChevronDown, ChevronUp, Plus, Trash2, Download, Upload } from 'lucide-react';
import { useConfig, exportConfigToFile, importConfigFromFile } from '../../store/configStore';
import { STRATEGIES, STRATEGY_IDS } from '../../engine/strategies';
import type { PlannerConfig, GuaranteedIncomeConfig, DCPotConfig, TaxFreeAccountConfig } from '../../engine/types';

const NOW_MONTH = new Date().toISOString().slice(0, 7);

function newDcPot(name: string): DCPotConfig {
  return {
    name,
    starting_balance: 0,
    growth_rate: 0.05,
    annual_fees: 0.004,
    tax_free_portion: 0.25,
    values_as_of: NOW_MONTH,
  };
}

function newTfAccount(name: string): TaxFreeAccountConfig {
  return {
    name,
    starting_balance: 0,
    growth_rate: 0.035,
    values_as_of: NOW_MONTH,
  };
}

function newGuaranteedIncome(name: string, retirementDate: string): GuaranteedIncomeConfig {
  return {
    name,
    gross_annual: 0,
    indexation_rate: 0.03,
    start_date: retirementDate || NOW_MONTH,
    end_date: null,
    taxable: true,
    values_as_of: NOW_MONTH,
  };
}

export default function ConfigPanel() {
  const { config, setConfig, updateConfig } = useConfig();
  const [open, setOpen] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);

  function handleExport() {
    exportConfigToFile(config);
  }

  function handleImport() {
    setImportError(null);
    importConfigFromFile()
      .then(cfg => { setConfig(cfg); })
      .catch(err => { setImportError(err.message); });
  }

  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const strategyDef = STRATEGIES[strategyId];
  const strategyParams = config.drawdown_strategy_params ?? {};

  function setNested(path: string, val: number | string) {
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

  // ---- Guaranteed income CRUD ---- //
  function updateGuaranteed(index: number, field: string, val: string | number | boolean | null) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      (next.guaranteed_income[index] as unknown as Record<string, unknown>)[field] = val;
      return next;
    });
  }

  function addGuaranteed() {
    updateConfig(prev => ({
      ...prev,
      guaranteed_income: [
        ...prev.guaranteed_income,
        newGuaranteedIncome(`Pension ${prev.guaranteed_income.length + 1}`, prev.personal.retirement_date),
      ],
    }));
  }

  function removeGuaranteed(index: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      next.guaranteed_income.splice(index, 1);
      return next;
    });
  }

  // ---- DC pot CRUD ---- //
  function updateDcPot(index: number, field: keyof DCPotConfig, val: string | number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const pot = next.dc_pots[index]!;
      const oldName = pot.name;
      if (field === 'name') {
        pot.name = val as string;
        next.withdrawal_priority = next.withdrawal_priority.map(n => n === oldName ? val as string : n);
      } else {
        (pot as unknown as Record<string, unknown>)[field] = val;
      }
      return next;
    });
  }

  function addDcPot() {
    updateConfig(prev => {
      const name = `DC Pot ${prev.dc_pots.length + 1}`;
      return {
        ...prev,
        dc_pots: [...prev.dc_pots, newDcPot(name)],
        withdrawal_priority: [...prev.withdrawal_priority, name],
      };
    });
  }

  function removeDcPot(index: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const removed = next.dc_pots.splice(index, 1)[0]!;
      next.withdrawal_priority = next.withdrawal_priority.filter(n => n !== removed.name);
      return next;
    });
  }

  // ---- Tax-free account CRUD ---- //
  function updateTfAccount(index: number, field: keyof TaxFreeAccountConfig, val: string | number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const acc = next.tax_free_accounts[index]!;
      const oldName = acc.name;
      if (field === 'name') {
        acc.name = val as string;
        next.withdrawal_priority = next.withdrawal_priority.map(n => n === oldName ? val as string : n);
      } else {
        (acc as unknown as Record<string, unknown>)[field] = val;
      }
      return next;
    });
  }

  function addTfAccount() {
    updateConfig(prev => {
      const name = `ISA ${prev.tax_free_accounts.length + 1}`;
      return {
        ...prev,
        tax_free_accounts: [...prev.tax_free_accounts, newTfAccount(name)],
        withdrawal_priority: [...prev.withdrawal_priority, name],
      };
    });
  }

  function removeTfAccount(index: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const removed = next.tax_free_accounts.splice(index, 1)[0]!;
      next.withdrawal_priority = next.withdrawal_priority.filter(n => n !== removed.name);
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
        <div className="px-4 pb-4 space-y-5 border-t border-gray-100 pt-3">
          {/* Export / Import */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Config
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Config
            </button>
            {importError && (
              <span className="text-xs text-red-600">{importError}</span>
            )}
          </div>
          {/* Personal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Date of Birth">
              <input
                type="month"
                value={config.personal.date_of_birth}
                onChange={e => setNested('personal.date_of_birth', e.target.value)}
                className="input-field"
              />
            </Field>

            <Field label="Retirement Date">
              <input
                type="month"
                value={config.personal.retirement_date}
                onChange={e => setNested('personal.retirement_date', e.target.value)}
                className="input-field"
              />
            </Field>

            <Field label="Plan Until Age">
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
          </div>

          {/* Income + Strategy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Target Net Income (£/yr)" tooltip={strategyDef?.portfolio_driven ? 'Not used — this strategy derives income from the portfolio' : undefined}>
              <input
                type="number"
                value={config.target_income.net_annual}
                step={500}
                disabled={!!strategyDef?.portfolio_driven}
                onChange={e => setNested('target_income.net_annual', Number(e.target.value))}
                className={`input-field ${strategyDef?.portfolio_driven ? 'opacity-40 cursor-not-allowed' : ''}`}
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
                  updateConfig(prev => {
                    return {
                      ...prev,
                      drawdown_strategy: newId,
                      drawdown_strategy_params: defaults,
                    };
                  });
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

          {/* Guaranteed Income */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Guaranteed Income (Pensions)
              </h4>
              <button
                onClick={addGuaranteed}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add pension
              </button>
            </div>
            {config.guaranteed_income.length === 0 && (
              <p className="text-xs text-gray-400 italic">No guaranteed income sources configured.</p>
            )}
            <div className="space-y-3">
              {config.guaranteed_income.map((gi, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] sm:grid-cols-[2fr_1fr_0.8fr_0.7fr_0.7fr_auto] gap-2 items-end">
                  <Field label="Name">
                    <input
                      type="text"
                      value={gi.name}
                      onChange={e => updateGuaranteed(i, 'name', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Gross Annual (£)">
                    <input
                      type="number"
                      value={gi.gross_annual}
                      step={100}
                      onChange={e => updateGuaranteed(i, 'gross_annual', Number(e.target.value))}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Indexation (%)">
                    <input
                      type="number"
                      value={(gi.indexation_rate * 100).toFixed(1)}
                      step={0.1}
                      onChange={e => updateGuaranteed(i, 'indexation_rate', Number(e.target.value) / 100)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Starts">
                    <input
                      type="month"
                      value={gi.start_date ?? ''}
                      onChange={e => updateGuaranteed(i, 'start_date', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Taxable">
                    <select
                      value={gi.taxable ? 'yes' : 'no'}
                      onChange={e => updateGuaranteed(i, 'taxable', e.target.value === 'yes')}
                      className="input-field"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                  <button
                    onClick={() => removeGuaranteed(i)}
                    className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove pension"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* DC Pots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Drawdown Pots (DC)
              </h4>
              <button
                onClick={addDcPot}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add pot
              </button>
            </div>
            {config.dc_pots.length === 0 && (
              <p className="text-xs text-gray-400 italic">No drawdown pots configured.</p>
            )}
            <div className="space-y-3">
              {config.dc_pots.map((pot, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_0.8fr_0.8fr_0.8fr_1fr_auto] gap-2 items-end">
                  <Field label="Name">
                    <input
                      type="text"
                      value={pot.name}
                      onChange={e => updateDcPot(i, 'name', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Balance (£)">
                    <input
                      type="number"
                      value={pot.starting_balance}
                      step={1000}
                      onChange={e => updateDcPot(i, 'starting_balance', Number(e.target.value))}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Growth (%)">
                    <input
                      type="number"
                      value={(pot.growth_rate * 100).toFixed(1)}
                      step={0.1}
                      onChange={e => updateDcPot(i, 'growth_rate', Number(e.target.value) / 100)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Fees (%)">
                    <input
                      type="number"
                      value={(pot.annual_fees * 100).toFixed(2)}
                      step={0.01}
                      onChange={e => updateDcPot(i, 'annual_fees', Number(e.target.value) / 100)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Tax-free (%)">
                    <input
                      type="number"
                      value={(pot.tax_free_portion * 100).toFixed(0)}
                      step={5}
                      onChange={e => updateDcPot(i, 'tax_free_portion', Number(e.target.value) / 100)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Value as of">
                    <input
                      type="month"
                      value={pot.values_as_of ?? ''}
                      onChange={e => updateDcPot(i, 'values_as_of', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <button
                    onClick={() => removeDcPot(i)}
                    className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove pot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Withdrawal Priority */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Withdrawal Priority
            </h4>
            <p className="text-xs text-gray-400 mb-2">Top = withdrawn first. Use arrows to reorder.</p>
            <div className="space-y-1">
              {config.withdrawal_priority.map((name, i) => (
                <div key={name} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm text-gray-700">
                  <span className="text-xs font-medium text-gray-400 w-4">{i + 1}.</span>
                  <span className="flex-1">{name}</span>
                  <button
                    disabled={i === 0}
                    onClick={() => updateConfig(prev => {
                      const next = [...prev.withdrawal_priority];
                      [next[i - 1]!, next[i]!] = [next[i]!, next[i - 1]!];
                      return { ...prev, withdrawal_priority: next };
                    })}
                    className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    disabled={i === config.withdrawal_priority.length - 1}
                    onClick={() => updateConfig(prev => {
                      const next = [...prev.withdrawal_priority];
                      [next[i]!, next[i + 1]!] = [next[i + 1]!, next[i]!];
                      return { ...prev, withdrawal_priority: next };
                    })}
                    className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax-Free Accounts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tax-Free Accounts (ISA / equivalent)
              </h4>
              <button
                onClick={addTfAccount}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add account
              </button>
            </div>
            {config.tax_free_accounts.length === 0 && (
              <p className="text-xs text-gray-400 italic">No tax-free accounts configured.</p>
            )}
            <div className="space-y-3">
              {config.tax_free_accounts.map((acc, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_0.8fr_1fr_auto] gap-2 items-end">
                  <Field label="Name">
                    <input
                      type="text"
                      value={acc.name}
                      onChange={e => updateTfAccount(i, 'name', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Balance (£)">
                    <input
                      type="number"
                      value={acc.starting_balance}
                      step={1000}
                      onChange={e => updateTfAccount(i, 'starting_balance', Number(e.target.value))}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Growth (%)">
                    <input
                      type="number"
                      value={(acc.growth_rate * 100).toFixed(1)}
                      step={0.1}
                      onChange={e => updateTfAccount(i, 'growth_rate', Number(e.target.value) / 100)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Value as of">
                    <input
                      type="month"
                      value={acc.values_as_of ?? ''}
                      onChange={e => updateTfAccount(i, 'values_as_of', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <button
                    onClick={() => removeTfAccount(i)}
                    className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
