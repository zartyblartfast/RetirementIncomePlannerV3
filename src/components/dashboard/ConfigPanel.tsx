import { useState, type ReactNode } from 'react';
import { Settings, ChevronDown, ChevronUp, Plus, Trash2, Download, Upload } from 'lucide-react';
import { useConfig, exportConfigToFile, importConfigFromFile } from '../../store/configStore';
import { exportCaseToFile, importCaseFromFile, loadCaseMetadata, saveCaseMetadata, type CaseMetadata } from '../../store/caseStore';
import { STRATEGIES, STRATEGY_IDS } from '../../engine/strategies';
import { TAX_RULE_PACKS, taxConfigFromRulePack } from '../../engine/taxRulePacks';
import type { PlannerConfig, GuaranteedIncomeConfig, DCPotConfig, TaxFreeAccountConfig, AllocationConfig, IncomeSourceType } from '../../engine/types';
import {
  allocationFromTemplate,
  allocationTemplateLabel,
  customAllocationFromExisting,
  customWeightTotal,
  getAssetClassOptions,
  getPortfolioTemplateOptions,
  makeDefaultAllocation,
  normalizeAllocation,
  defaultGrowthRateFromAllocation,
} from '../../engine/assetAllocation';
import { deriveRetirementAge } from '../../engine/dateUtils';
import {
  appendDrawdownStageForSource,
  displayNameForDrawdownStage,
  moveDrawdownStage,
  normalizeConfigDrawdownStages,
  removeDrawdownStageSource,
  renameDrawdownStageSource,
  updateDrawdownStageName,
  updateDrawdownStageSourceShare,
} from '../../engine/drawdownStages';

const NOW_MONTH = new Date().toISOString().slice(0, 7);

function addMonths(yearMonth: string, monthsToAdd: number): string {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  if (!year || !month) return NOW_MONTH;
  const zeroBased = month - 1 + monthsToAdd;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function newDcPot(name: string): DCPotConfig {
  const allocation = makeDefaultAllocation();
  return {
    name,
    starting_balance: 0,
    growth_rate: defaultGrowthRateFromAllocation(allocation),
    annual_fees: 0.004,
    tax_free_portion: 0.25,
    allocation,
    values_as_of: NOW_MONTH,
  };
}

function newTfAccount(name: string): TaxFreeAccountConfig {
  const allocation = makeDefaultAllocation();
  return {
    name,
    starting_balance: 0,
    growth_rate: defaultGrowthRateFromAllocation(allocation),
    allocation,
    values_as_of: NOW_MONTH,
  };
}

function newGuaranteedIncome(
  name: string,
  retirementDate: string,
  incomeType: IncomeSourceType = 'defined_benefit',
): GuaranteedIncomeConfig {
  return {
    name,
    income_type: incomeType,
    gross_annual: 0,
    indexation_rate: incomeType === 'part_time_salary' ? 0 : 0.03,
    start_date: retirementDate || NOW_MONTH,
    end_date: incomeType === 'part_time_salary' ? addMonths(retirementDate || NOW_MONTH, 24) : null,
    taxable: true,
    values_as_of: NOW_MONTH,
  };
}

const INCOME_SOURCE_TYPE_OPTIONS: Array<{ value: IncomeSourceType; label: string }> = [
  { value: 'state_pension', label: 'State Pension' },
  { value: 'defined_benefit', label: 'DB / pension income' },
  { value: 'annuity', label: 'Annuity' },
  { value: 'part_time_salary', label: 'Part-time salary' },
  { value: 'other', label: 'Other income' },
];

function ageLabelAtMonth(dateOfBirth: string, month?: string | null): string | null {
  if (!dateOfBirth || !month) return null;
  return `age ${deriveRetirementAge(dateOfBirth, month)}`;
}

export default function ConfigPanel() {
  const { config, setConfig, updateConfig } = useConfig();
  const [open, setOpen] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [caseMetadata, setCaseMetadata] = useState<CaseMetadata>(() => loadCaseMetadata());

  function handleExport() {
    exportConfigToFile(config);
  }

  function handleExportCase() {
    exportCaseToFile(config);
  }

  function handleImportCase() {
    const confirmed = window.confirm(
      'This will replace your current config, case details, Review baseline/history, and What If scenarios with the case file you select. Continue?'
    );
    if (!confirmed) return;
    setImportError(null);
    importCaseFromFile()
      .then(caseFile => {
        setConfig(caseFile.config);
        setCaseMetadata(caseFile.case_metadata);
      })
      .catch(err => { setImportError((err as Error).message); });
  }

  function updateCaseMetadata(field: keyof CaseMetadata, value: string) {
    setCaseMetadata(prev => saveCaseMetadata({ ...prev, [field]: value }));
  }

  function handleImport() {
    const confirmed = window.confirm(
      'This will replace your current config with the file you select. Continue?'
    )
    if (!confirmed) return
    setImportError(null)
    importConfigFromFile()
      .then(cfg => { setConfig(cfg); })
      .catch(err => { setImportError(err.message); });
  }

  const strategyId = config.drawdown_strategy ?? 'fixed_target';
  const strategyDef = STRATEGIES[strategyId];
  const strategyParams = config.drawdown_strategy_params ?? {};
  const portfolioTemplates = getPortfolioTemplateOptions();
  const assetClasses = getAssetClassOptions();

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

  function setTaxRulePack(rulePackId: string) {
    updateConfig(prev => ({
      ...prev,
      tax: rulePackId === 'custom'
        ? { ...prev.tax, rule_pack_id: undefined }
        : taxConfigFromRulePack(rulePackId),
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
        newGuaranteedIncome(`Income source ${prev.guaranteed_income.length + 1}`, prev.personal.retirement_date),
      ],
    }));
  }

  function addPartTimeSalary() {
    updateConfig(prev => ({
      ...prev,
      guaranteed_income: [
        ...prev.guaranteed_income,
        newGuaranteedIncome('Part-time salary', prev.personal.retirement_date, 'part_time_salary'),
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
  function updateDcPot(index: number, field: keyof DCPotConfig, val: string | number | AllocationConfig) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const pot = next.dc_pots[index]!;
      const oldName = pot.name;
      if (field === 'name') {
        pot.name = val as string;
        next.withdrawal_priority = next.withdrawal_priority.map(n => n === oldName ? val as string : n);
        renameDrawdownStageSource(next, oldName, val as string);
      } else {
        (pot as unknown as Record<string, unknown>)[field] = val;
      }
      return next;
    });
  }

  function addDcPot() {
    updateConfig(prev => {
      const name = `DC Pot ${prev.dc_pots.length + 1}`;
      const next = {
        ...prev,
        dc_pots: [...prev.dc_pots, newDcPot(name)],
        withdrawal_priority: [...prev.withdrawal_priority, name],
      };
      appendDrawdownStageForSource(next, name);
      return next;
    });
  }

  function removeDcPot(index: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const removed = next.dc_pots.splice(index, 1)[0]!;
      next.withdrawal_priority = next.withdrawal_priority.filter(n => n !== removed.name);
      removeDrawdownStageSource(next, removed.name);
      return next;
    });
  }

  // ---- Tax-free account CRUD ---- //
  function updateTfAccount(index: number, field: keyof TaxFreeAccountConfig, val: string | number | AllocationConfig) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const acc = next.tax_free_accounts[index]!;
      const oldName = acc.name;
      if (field === 'name') {
        acc.name = val as string;
        next.withdrawal_priority = next.withdrawal_priority.map(n => n === oldName ? val as string : n);
        renameDrawdownStageSource(next, oldName, val as string);
      } else {
        (acc as unknown as Record<string, unknown>)[field] = val;
      }
      return next;
    });
  }

  function addTfAccount() {
    updateConfig(prev => {
      const name = `ISA ${prev.tax_free_accounts.length + 1}`;
      const next = {
        ...prev,
        tax_free_accounts: [...prev.tax_free_accounts, newTfAccount(name)],
        withdrawal_priority: [...prev.withdrawal_priority, name],
      };
      appendDrawdownStageForSource(next, name);
      return next;
    });
  }

  function removeTfAccount(index: number) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const removed = next.tax_free_accounts.splice(index, 1)[0]!;
      next.withdrawal_priority = next.withdrawal_priority.filter(n => n !== removed.name);
      removeDrawdownStageSource(next, removed.name);
      return next;
    });
  }

  function updateAllocation(
    sourceType: 'dc' | 'tf',
    index: number,
    allocation: AllocationConfig,
  ) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const account = sourceType === 'dc' ? next.dc_pots[index] : next.tax_free_accounts[index];
      if (!account) return next;
      account.allocation = allocation;
      account.growth_rate = defaultGrowthRateFromAllocation(allocation);
      return next;
    });
  }

  function updateCustomAllocationWeight(
    sourceType: 'dc' | 'tf',
    index: number,
    assetClassId: string,
    percentage: number,
  ) {
    updateConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PlannerConfig;
      const account = sourceType === 'dc' ? next.dc_pots[index] : next.tax_free_accounts[index];
      if (!account) return next;
      const current = normalizeAllocation(account.allocation);
      const customWeights = current.mode === 'custom' ? { ...(current.custom_weights ?? {}) } : {};
      customWeights[assetClassId] = Math.max(0, percentage / 100);
      const allocation: AllocationConfig = {
        mode: 'custom',
        custom_weights: customWeights,
        manual_override: true,
      };
      account.allocation = allocation;
      account.growth_rate = defaultGrowthRateFromAllocation(allocation);
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
          {/* Case details */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Case Details</h4>
            <p className="text-xs text-gray-400 mb-2">
              Local-only labels to help identify exported case files. These are saved in this browser and included in full-case exports.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Case name">
                <input
                  type="text"
                  value={caseMetadata.case_name}
                  onChange={e => updateCaseMetadata('case_name', e.target.value)}
                  placeholder="e.g. Main retirement plan"
                  className="input-field"
                />
              </Field>
              <Field label="Reference">
                <input
                  type="text"
                  value={caseMetadata.case_reference}
                  onChange={e => updateCaseMetadata('case_reference', e.target.value)}
                  placeholder="e.g. Client or household ref"
                  className="input-field"
                />
              </Field>
              <Field label="Owner / client label">
                <input
                  type="text"
                  value={caseMetadata.owner_label}
                  onChange={e => updateCaseMetadata('owner_label', e.target.value)}
                  placeholder="Optional"
                  className="input-field"
                />
              </Field>
            </div>
            <label className="block mt-3">
              <span className="text-xs font-medium text-gray-600">Case notes</span>
              <input
                type="text"
                value={caseMetadata.notes}
                onChange={e => updateCaseMetadata('notes', e.target.value)}
                placeholder="Optional local notes included in full-case export"
                className="input-field"
              />
            </label>
          </div>

          {/* Save / Restore */}
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <h4 className="text-xs font-medium text-blue-900 uppercase tracking-wider mb-1">Case File</h4>
              <p className="text-xs text-blue-800 mb-2">
                Recommended. Saves your current plan, case details, Review history, and What If scenarios.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleExportCase}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-blue-300 text-blue-700 bg-white hover:bg-blue-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save Case
                </button>
                <button
                  onClick={handleImportCase}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-blue-300 text-blue-700 bg-white hover:bg-blue-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Restore Case
                </button>
              </div>
            </div>

            <details className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <summary className="cursor-pointer text-xs font-medium text-gray-600 uppercase tracking-wider">Advanced config-only files</summary>
              <p className="text-xs text-gray-500 mt-2 mb-2">
                Advanced. Saves only the current plan settings. Does not include case details, Review history, or What If scenarios.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Config Only
                </button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Config Only
                </button>
              </div>
            </details>

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
              <HelperText>{ageLabelAtMonth(config.personal.date_of_birth, config.personal.retirement_date)}</HelperText>
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

            <Field label="Tax Jurisdiction">
              <select
                value={config.tax.rule_pack_id ?? 'custom'}
                onChange={e => setTaxRulePack(e.target.value)}
                className="input-field"
              >
                <option value="custom">Custom</option>
                {TAX_RULE_PACKS.map(pack => (
                  <option key={pack.id} value={pack.id}>{pack.label}</option>
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

          {/* Income Sources */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Income Sources
                </h4>
                <p className="text-xs text-gray-400 mt-1">
                  Pensions, annuities, salary or other income. Start/end dates, taxability and indexation are explicit so temporary semi-retirement income is visible.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addPartTimeSalary}
                  className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add part-time salary
                </button>
                <button
                  onClick={addGuaranteed}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add income source
                </button>
              </div>
            </div>
            {config.guaranteed_income.length === 0 && (
              <p className="text-xs text-gray-400 italic">No income sources configured.</p>
            )}
            <div className="space-y-3">
              {config.guaranteed_income.map((gi, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.7fr_1.2fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-2 items-start rounded-md border border-gray-100 bg-gray-50/40 p-2">
                  <Field label="Name">
                    <input
                      type="text"
                      value={gi.name}
                      onChange={e => updateGuaranteed(i, 'name', e.target.value)}
                      className="input-field"
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={gi.income_type ?? 'defined_benefit'}
                      onChange={e => updateGuaranteed(i, 'income_type', e.target.value)}
                      className="input-field"
                    >
                      {INCOME_SOURCE_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {gi.income_type === 'part_time_salary' && (
                      <HelperText>Salary-style taxable income; use Ends for semi-retirement work.</HelperText>
                    )}
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
                    {gi.income_type === 'state_pension' && (
                      <HelperText>{ageLabelAtMonth(config.personal.date_of_birth, gi.start_date)}</HelperText>
                    )}
                  </Field>
                  <Field label="Ends">
                    <input
                      type="month"
                      value={gi.end_date ?? ''}
                      onChange={e => updateGuaranteed(i, 'end_date', e.target.value || null)}
                      className="input-field"
                    />
                    <HelperText>{gi.end_date ? ageLabelAtMonth(config.personal.date_of_birth, gi.end_date) : 'Lifetime / ongoing'}</HelperText>
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
                    title="Remove income source"
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
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_0.8fr_0.8fr_0.8fr_1.3fr_1fr_auto] gap-2 items-start">
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
                    <div className="mt-1 space-y-1">
                      <input
                        type="number"
                        value={(pot.growth_rate * 100).toFixed(1)}
                        step={0.1}
                        onChange={e => updateDcPot(i, 'growth_rate', Number(e.target.value) / 100)}
                        className="input-field mt-0"
                      />
                      <p className="text-[11px] leading-snug text-gray-400">
                        Auto-filled from asset allocation; edit here to override.
                      </p>
                    </div>
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
                  <AllocationSelector
                    allocation={pot.allocation}
                    portfolioTemplates={portfolioTemplates}
                    assetClasses={assetClasses}
                    onChange={(allocation) => updateAllocation('dc', i, allocation)}
                    onCustomWeightChange={(assetClassId, percentage) => updateCustomAllocationWeight('dc', i, assetClassId, percentage)}
                  />
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

          {/* Drawdown order and blending */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Drawdown order and blending
            </h4>
            <p className="text-xs text-gray-400 mb-2">
              Top stage funds withdrawals first. One source behaves like the old priority order; multiple sources in one stage are blended by the percentages shown.
            </p>
            <div className="space-y-2">
              {normalizeConfigDrawdownStages(JSON.parse(JSON.stringify(config)) as PlannerConfig).drawdown_stages?.map((stage, i, stages) => {
                const shareTotal = stage.sources.reduce((total, source) => total + source.target_share, 0);
                const shareTotalOk = Math.abs(shareTotal - 1) <= 0.000001;
                return (
                <div key={stage.id} className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-gray-400 w-4 pt-6">{i + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <Field label="Stage name">
                        <input
                          type="text"
                          value={stage.name ?? ''}
                          placeholder={displayNameForDrawdownStage(stage, i)}
                          onChange={e => updateConfig(prev => {
                            const next = normalizeConfigDrawdownStages(JSON.parse(JSON.stringify(prev)) as PlannerConfig);
                            updateDrawdownStageName(next, i, e.target.value);
                            return next;
                          })}
                          className="input-field"
                        />
                      </Field>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-500">Sources</span>
                          {!shareTotalOk && (
                            <span className="text-[11px] text-amber-600">Shares total {(shareTotal * 100).toFixed(1)}%</span>
                          )}
                        </div>
                        {stage.sources.map((source, sourceIndex) => (
                          <div key={`${source.source_type}:${source.source_name}`} className="grid grid-cols-[1fr_5rem] gap-2 items-center">
                            <span className="text-xs text-gray-500 truncate">{source.source_name}</span>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={(source.target_share * 100).toFixed(1)}
                                disabled={stage.sources.length === 1}
                                onChange={e => updateConfig(prev => {
                                  const next = normalizeConfigDrawdownStages(JSON.parse(JSON.stringify(prev)) as PlannerConfig);
                                  updateDrawdownStageSourceShare(next, i, sourceIndex, Number(e.target.value) / 100);
                                  return next;
                                })}
                                className="input-field pr-6 disabled:bg-gray-100 disabled:text-gray-400"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 pt-6">
                      <button
                        disabled={i === 0}
                        onClick={() => updateConfig(prev => {
                          const next = normalizeConfigDrawdownStages(JSON.parse(JSON.stringify(prev)) as PlannerConfig);
                          moveDrawdownStage(next, i, -1);
                          return next;
                        })}
                        className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        title="Move stage up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        disabled={i === stages.length - 1}
                        onClick={() => updateConfig(prev => {
                          const next = normalizeConfigDrawdownStages(JSON.parse(JSON.stringify(prev)) as PlannerConfig);
                          moveDrawdownStage(next, i, 1);
                          return next;
                        })}
                        className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        title="Move stage down"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
              })}
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
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_0.8fr_1.3fr_1fr_auto] gap-2 items-start">
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
                    <div className="mt-1 space-y-1">
                      <input
                        type="number"
                        value={(acc.growth_rate * 100).toFixed(1)}
                        step={0.1}
                        onChange={e => updateTfAccount(i, 'growth_rate', Number(e.target.value) / 100)}
                        className="input-field mt-0"
                      />
                      <p className="text-[11px] leading-snug text-gray-400">
                        Auto-filled from asset allocation; edit here to override.
                      </p>
                    </div>
                  </Field>
                  <AllocationSelector
                    allocation={acc.allocation}
                    portfolioTemplates={portfolioTemplates}
                    assetClasses={assetClasses}
                    onChange={(allocation) => updateAllocation('tf', i, allocation)}
                    onCustomWeightChange={(assetClassId, percentage) => updateCustomAllocationWeight('tf', i, assetClassId, percentage)}
                  />
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

function AllocationSelector({
  label = 'Asset allocation',
  allocation,
  portfolioTemplates,
  assetClasses,
  onChange,
  onCustomWeightChange,
}: {
  label?: string;
  allocation: AllocationConfig | undefined;
  portfolioTemplates: ReturnType<typeof getPortfolioTemplateOptions>;
  assetClasses: ReturnType<typeof getAssetClassOptions>;
  onChange: (allocation: AllocationConfig) => void;
  onCustomWeightChange: (assetClassId: string, percentage: number) => void;
}) {
  const normalized = normalizeAllocation(allocation);
  const selectedValue = normalized.mode === 'custom'
    ? 'custom'
    : normalized.template_id ?? 'default_like_diversified_growth';
  const total = customWeightTotal(normalized);

  return (
    <div className="space-y-2">
      <Field label={label} tooltip="User/adviser-selected broad mapping from the real fund or portfolio to the app's planning asset classes.">
        <select
          value={selectedValue}
          onChange={e => {
            const value = e.target.value;
            if (value === 'custom') {
              onChange(customAllocationFromExisting({ allocation: normalized }));
            } else {
              onChange(allocationFromTemplate(value));
            }
          }}
          className="input-field"
        >
          {portfolioTemplates.map(template => (
            <option key={template.id} value={template.id}>
              {template.label}{template.id === 'default_like_diversified_growth' ? ' (default)' : ''}
            </option>
          ))}
          <option value="custom">Custom mix</option>
        </select>
      </Field>
      <p className="text-[11px] leading-snug text-gray-400">
        Approximate mapping only. Check the provider factsheet or adviser judgement; mappings can be updated later.
      </p>
      {normalized.mode === 'custom' && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {assetClasses.map(assetClass => (
              <label key={assetClass.id} className="block">
                <span className="text-[11px] font-medium text-gray-500">{assetClass.label}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={(((normalized.custom_weights ?? {})[assetClass.id] ?? 0) * 100).toFixed(0)}
                  onChange={e => onCustomWeightChange(assetClass.id, Number(e.target.value))}
                  className="input-field"
                />
              </label>
            ))}
          </div>
          <p className={`text-[11px] ${Math.abs(total - 1) < 0.0001 ? 'text-gray-500' : 'text-amber-700'}`}>
            Custom weights total {(total * 100).toFixed(0)}%. The growth suggestion normalises weights, but a 100% total is clearer for adviser review.
          </p>
        </div>
      )}
      {normalized.mode === 'template' && (
        <p className="text-[11px] text-gray-400">Selected: {allocationTemplateLabel(normalized.template_id)}</p>
      )}
    </div>
  );
}

function HelperText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-[11px] leading-snug text-gray-400">{children}</p>;
}

function Field({ label, tooltip, children }: {
  label: string;
  tooltip?: string;
  children: ReactNode;
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
