/**
 * OnboardingWizard — 5-step modal that collects initial user data and
 * builds a PlannerConfig, saving it to the config store on finish.
 */

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useConfig, DEFAULT_CONFIG, exportConfigToFile } from '../../store/configStore';
import type { PlannerConfig } from '../../engine/types';

// ------------------------------------------------------------------ //
//  WizardData — the raw form state
// ------------------------------------------------------------------ //

interface WizardData {
  dob: string;               // 'YYYY-MM'
  retirementDate: string;    // 'YYYY-MM'
  endAge: number;
  targetNetAnnual: number;
  cpiRate: number;
  hasStatePension: boolean;
  statePensionGross: number;
  statePensionStart: string; // 'YYYY-MM'
  hasDcPot: boolean;
  dcPotName: string;
  dcPotBalance: number;
  dcGrowthRate: number;
  dcFees: number;
  hasIsa: boolean;
  isaBalance: number;
  isaGrowthRate: number;
}

const DEFAULT_DATA: WizardData = {
  dob: '1970-01',
  retirementDate: '2035-01',
  endAge: 90,
  targetNetAnnual: 25000,
  cpiRate: 0.025,
  hasStatePension: true,
  statePensionGross: 11973,
  statePensionStart: '2035-01',
  hasDcPot: true,
  dcPotName: 'DC Pension',
  dcPotBalance: 100000,
  dcGrowthRate: 0.04,
  dcFees: 0.005,
  hasIsa: false,
  isaBalance: 0,
  isaGrowthRate: 0.035,
};

// ------------------------------------------------------------------ //
//  buildConfig — maps WizardData to PlannerConfig
// ------------------------------------------------------------------ //

function currentYYYYMM(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildConfig(data: WizardData): PlannerConfig {
  const cfg: PlannerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  cfg.personal.date_of_birth = data.dob;
  cfg.personal.retirement_date = data.retirementDate;
  cfg.personal.end_age = data.endAge;

  cfg.target_income.net_annual = data.targetNetAnnual;
  cfg.target_income.cpi_rate = data.cpiRate;

  if (data.hasStatePension) {
    const baseGi = DEFAULT_CONFIG.guaranteed_income[0] ?? {
      name: 'State Pension',
      gross_annual: 11973,
      indexation_rate: 0.025,
      start_date: cfg.personal.retirement_date,
      end_date: null as null,
      taxable: true,
      values_as_of: currentYYYYMM(),
    }
    cfg.guaranteed_income = [
      {
        ...baseGi,
        gross_annual: data.statePensionGross,
        start_date: data.statePensionStart,
      },
    ];
  } else {
    cfg.guaranteed_income = [];
  }

  const now = currentYYYYMM();

  if (data.hasDcPot) {
    cfg.dc_pots = [
      {
        name: data.dcPotName,
        starting_balance: data.dcPotBalance,
        growth_rate: data.dcGrowthRate,
        annual_fees: data.dcFees,
        tax_free_portion: 0.25,
        values_as_of: now,
      },
    ];
  } else {
    cfg.dc_pots = [];
  }

  if (data.hasIsa) {
    cfg.tax_free_accounts = [
      {
        name: 'ISA',
        starting_balance: data.isaBalance,
        growth_rate: data.isaGrowthRate,
        values_as_of: now,
      },
    ];
  } else {
    cfg.tax_free_accounts = [];
  }

  cfg.withdrawal_priority = [
    ...(data.hasDcPot ? [data.dcPotName] : []),
    ...(data.hasIsa ? ['ISA'] : []),
  ];

  return cfg;
}

// ------------------------------------------------------------------ //
//  Step sub-components
// ------------------------------------------------------------------ //

interface StepProps {
  data: WizardData;
  onChange: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
}

function Step1({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">About you</h2>

      <div>
        <label className="block text-sm text-gray-300 mb-1">Date of birth</label>
        <input
          type="month"
          value={data.dob}
          onChange={e => onChange('dob', e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-300 mb-1">Target retirement date</label>
        <input
          type="month"
          value={data.retirementDate}
          onChange={e => onChange('retirementDate', e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-300 mb-1">Plan to age</label>
        <input
          type="number"
          min={70}
          max={100}
          value={data.endAge}
          onChange={e => onChange('endAge', parseInt(e.target.value, 10))}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
        />
      </div>
    </div>
  );
}

function Step2({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Target income</h2>

      <div>
        <label className="block text-sm text-gray-300 mb-1">Target net annual income (&pound;)</label>
        <input
          type="number"
          value={data.targetNetAnnual}
          onChange={e => onChange('targetNetAnnual', parseFloat(e.target.value))}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-300 mb-1">Expected inflation rate</label>
        <input
          type="number"
          step="0.001"
          value={parseFloat((data.cpiRate * 100).toFixed(3))}
          onChange={e => onChange('cpiRate', parseFloat(e.target.value) / 100)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">e.g. 2.5 for 2.5%</p>
      </div>
    </div>
  );
}

function Step3({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">State pension</h2>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={data.hasStatePension}
          onChange={e => onChange('hasStatePension', e.target.checked)}
          className="w-4 h-4 accent-emerald-500"
        />
        <span className="text-sm text-gray-300">I have / expect a state pension</span>
      </label>

      {data.hasStatePension && (
        <>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Annual gross amount (&pound;)</label>
            <input
              type="number"
              value={data.statePensionGross}
              onChange={e => onChange('statePensionGross', parseFloat(e.target.value))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Start date</label>
            <input
              type="month"
              value={data.statePensionStart}
              onChange={e => onChange('statePensionStart', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Step4({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Pension pot</h2>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={data.hasDcPot}
          onChange={e => onChange('hasDcPot', e.target.checked)}
          className="w-4 h-4 accent-emerald-500"
        />
        <span className="text-sm text-gray-300">I have a defined contribution (DC) pension pot</span>
      </label>

      {data.hasDcPot && (
        <>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Pot name</label>
            <input
              type="text"
              value={data.dcPotName}
              onChange={e => onChange('dcPotName', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Current value (&pound;)</label>
            <input
              type="number"
              value={data.dcPotBalance}
              onChange={e => onChange('dcPotBalance', parseFloat(e.target.value))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Annual growth rate %</label>
            <input
              type="number"
              step="0.1"
              value={parseFloat((data.dcGrowthRate * 100).toFixed(4))}
              onChange={e => onChange('dcGrowthRate', parseFloat(e.target.value) / 100)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Annual fees %</label>
            <input
              type="number"
              step="0.01"
              value={parseFloat((data.dcFees * 100).toFixed(4))}
              onChange={e => onChange('dcFees', parseFloat(e.target.value) / 100)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Step5({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">ISA / savings</h2>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={data.hasIsa}
          onChange={e => onChange('hasIsa', e.target.checked)}
          className="w-4 h-4 accent-emerald-500"
        />
        <span className="text-sm text-gray-300">I have an ISA or tax-free savings account</span>
      </label>

      {data.hasIsa && (
        <>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Current value (&pound;)</label>
            <input
              type="number"
              value={data.isaBalance}
              onChange={e => onChange('isaBalance', parseFloat(e.target.value))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Annual growth rate %</label>
            <input
              type="number"
              step="0.1"
              value={parseFloat((data.isaGrowthRate * 100).toFixed(4))}
              onChange={e => onChange('isaGrowthRate', parseFloat(e.target.value) / 100)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Progress bar
// ------------------------------------------------------------------ //

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`flex-1 h-1.5 rounded-full transition-colors ${
            i < step ? 'bg-emerald-500' : 'bg-gray-700'
          }`}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Main OnboardingWizard
// ------------------------------------------------------------------ //

interface OnboardingWizardProps {
  onDone: () => void;
}

export default function OnboardingWizard({ onDone }: OnboardingWizardProps) {
  const { setConfig, markConfigured } = useConfig();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);

  const TOTAL_STEPS = 5;

  function onChange<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function handleBack() {
    setStep(s => Math.max(1, s - 1));
  }

  function handleNext() {
    setStep(s => Math.min(TOTAL_STEPS, s + 1));
  }

  function handleFinish() {
    const cfg = buildConfig(data);
    setConfig(cfg);
    markConfigured();
    const wantsBackup = window.confirm(
      'Setup complete! Would you like to save a backup of your config now?\n\nYou can always export later from the Config panel.'
    );
    if (wantsBackup) exportConfigToFile(cfg);
    onDone();
  }

  function renderStep() {
    switch (step) {
      case 1: return <Step1 data={data} onChange={onChange} />;
      case 2: return <Step2 data={data} onChange={onChange} />;
      case 3: return <Step3 data={data} onChange={onChange} />;
      case 4: return <Step4 data={data} onChange={onChange} />;
      case 5: return <Step5 data={data} onChange={onChange} />;
      default: return null;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-8 space-y-6">

        {/* Progress bar */}
        <ProgressBar step={step} total={TOTAL_STEPS} />

        {/* Step content */}
        {renderStep()}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step < TOTAL_STEPS ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Finish
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
