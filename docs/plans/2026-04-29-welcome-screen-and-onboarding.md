# Welcome Screen & Onboarding Wizard — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace silent DEFAULT_CONFIG fallback with an explicit welcome screen
(two paths: restore from file, or run wizard) when no localStorage config exists.
Retain the existing "Load Config" button on the dashboard for returning users.

**Architecture:**
- `configStore.ts` gains a `hasStoredConfig()` helper — the single source of truth
  for "is there a saved config?".
- A new `WelcomeScreen` page component handles the two entry paths.
- `ConfigProvider` exposes a `isFirstVisit` boolean and a `markConfigured()` helper.
- `App.tsx` conditionally renders `WelcomeScreen` instead of the normal layout when
  `isFirstVisit` is true.
- A new `OnboardingWizard` modal component (5 steps) collects the minimum viable config,
  then calls `setConfig()` + `markConfigured()`.
- The existing `importConfigFromFile` / `handleImport` in `ConfigPanel` is unchanged —
  the dashboard import button stays exactly where it is.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, Vitest

---

## Task 1: Add `hasStoredConfig()` to configStore

**Objective:** Single function that returns true when a real config is in localStorage.

**Files:**
- Modify: `src/store/configStore.ts`

**Step 1: Write failing test**

File: `src/store/__tests__/configStore.test.ts` (create if it doesn't exist)

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { hasStoredConfig, saveConfig, resetConfig } from '../configStore'
import { DEFAULT_CONFIG } from '../configStore'

describe('hasStoredConfig', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns false when localStorage is empty', () => {
    expect(hasStoredConfig()).toBe(false)
  })

  it('returns true after saveConfig is called', () => {
    saveConfig(DEFAULT_CONFIG)
    expect(hasStoredConfig()).toBe(true)
  })

  it('returns false after resetConfig is called', () => {
    saveConfig(DEFAULT_CONFIG)
    resetConfig()
    expect(hasStoredConfig()).toBe(false)
  })
})
```

**Step 2: Run test to verify failure**

Run: `npm test -- src/store/__tests__/configStore.test.ts`
Expected: FAIL — "hasStoredConfig is not a function"

**Step 3: Implement**

In `src/store/configStore.ts`, after the `loadConfig` function, add:

```ts
export function hasStoredConfig(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
```

**Step 4: Run test to verify pass**

Run: `npm test -- src/store/__tests__/configStore.test.ts`
Expected: 3 passed

**Step 5: Commit**

```
git add src/store/configStore.ts src/store/__tests__/configStore.test.ts
git commit -m "feat: add hasStoredConfig() to configStore"
```

---

## Task 2: Expose `isFirstVisit` and `markConfigured()` from ConfigProvider

**Objective:** Components can read whether the user needs onboarding and can dismiss it.

**Files:**
- Modify: `src/store/configStore.ts` (add to context interface)
- Modify: `src/store/ConfigProvider.tsx`

**Step 1: Extend ConfigContextValue in configStore.ts**

Add two new fields to the `ConfigContextValue` interface:

```ts
export interface ConfigContextValue {
  config: PlannerConfig;
  setConfig: (cfg: PlannerConfig) => void;
  updateConfig: (updater: (prev: PlannerConfig) => PlannerConfig) => void;
  resetToDefault: () => void;
  isFirstVisit: boolean;          // <-- new
  markConfigured: () => void;     // <-- new
}
```

**Step 2: Implement in ConfigProvider.tsx**

Replace the body of `ConfigProvider` to track first-visit state:

```tsx
import { useState, useCallback, type ReactNode } from 'react';
import { ConfigContext, loadConfig, saveConfig, resetConfig, hasStoredConfig } from './configStore';
import type { PlannerConfig } from '../engine/types';

export default function ConfigProvider({ children }: { children: ReactNode }) {
  const [isFirstVisit, setIsFirstVisit] = useState<boolean>(() => !hasStoredConfig());
  const [config, setConfigState] = useState<PlannerConfig>(() => loadConfig());

  const setConfig = useCallback((cfg: PlannerConfig) => {
    setConfigState(cfg);
    saveConfig(cfg);
  }, []);

  const updateConfig = useCallback((updater: (prev: PlannerConfig) => PlannerConfig) => {
    setConfigState(prev => {
      const next = updater(prev);
      saveConfig(next);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    const def = resetConfig();
    setConfigState(def);
    setIsFirstVisit(true);   // reset sends user back to welcome screen
  }, []);

  const markConfigured = useCallback(() => {
    setIsFirstVisit(false);
  }, []);

  return (
    <ConfigContext.Provider value={{
      config, setConfig, updateConfig, resetToDefault,
      isFirstVisit, markConfigured,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}
```

Note: `resetToDefault()` now sets `isFirstVisit(true)` — resetting the app sends
the user back to the welcome screen, which is the correct UX.

**Step 3: Run full test suite**

Run: `npm test`
Expected: all existing tests still pass (no regressions)

**Step 4: Commit**

```
git add src/store/configStore.ts src/store/ConfigProvider.tsx
git commit -m "feat: expose isFirstVisit and markConfigured from ConfigProvider"
```

---

## Task 3: Build WelcomeScreen component

**Objective:** Full-page welcome with two CTAs — restore from file or start wizard.

**Files:**
- Create: `src/pages/WelcomeScreen.tsx`

No engine logic. Pure UI. Props:
- `onLoadFile: () => void`  — triggers file import flow
- `onStartWizard: () => void` — opens onboarding wizard

```tsx
// src/pages/WelcomeScreen.tsx

import { Upload, Wand2 } from 'lucide-react';

interface Props {
  onLoadFile: () => void;
  onStartWizard: () => void;
  importError: string | null;
}

export default function WelcomeScreen({ onLoadFile, onStartWizard, importError }: Props) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-6">

        {/* Logo / title */}
        <div>
          <h1 className="text-3xl font-bold text-white">Retirement Income Planner</h1>
          <p className="text-gray-400 mt-2">
            Plan your drawdown strategy with confidence.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-8">

          {/* Option A: Restore from file */}
          <button
            onClick={onLoadFile}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500
                       rounded-xl p-6 text-left transition-colors group"
          >
            <Upload className="w-8 h-8 text-blue-400 mb-3" />
            <h2 className="text-white font-semibold text-lg">Restore from file</h2>
            <p className="text-gray-400 text-sm mt-1">
              Load a previously exported .json config file.
            </p>
          </button>

          {/* Option B: Setup wizard */}
          <button
            onClick={onStartWizard}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-emerald-500
                       rounded-xl p-6 text-left transition-colors group"
          >
            <Wand2 className="w-8 h-8 text-emerald-400 mb-3" />
            <h2 className="text-white font-semibold text-lg">Set up from scratch</h2>
            <p className="text-gray-400 text-sm mt-1">
              Answer a few questions to build your plan.
            </p>
          </button>

        </div>

        {/* Import error */}
        {importError && (
          <p className="text-red-400 text-sm mt-2">{importError}</p>
        )}

      </div>
    </div>
  );
}
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: all passing (no logic to test here, just a new file)

**Step 4: Commit**

```
git add src/pages/WelcomeScreen.tsx
git commit -m "feat: add WelcomeScreen component"
```

---

## Task 4: Build OnboardingWizard component (5-step modal)

**Objective:** Guided setup that collects the minimum viable config and calls setConfig.

**Files:**
- Create: `src/components/onboarding/OnboardingWizard.tsx`

The wizard is a full-screen modal overlay. Five steps, linear, no skipping.
Each step is a simple form section. On "Finish", it calls `setConfig(built config)` +
`markConfigured()`.

Steps:
  1. About you        — date_of_birth, retirement_date, end_age
  2. Target income    — net_annual, cpi_rate
  3. State pension    — gross_annual, start_date (or "I don't have one" checkbox)
  4. Pension pot      — DC pot name, starting_balance, growth_rate, annual_fees
  5. ISA / savings    — ISA starting_balance, growth_rate (or "I don't have one")

After step 5, a "Review & finish" summary is shown before final commit.

Wizard builds a full `PlannerConfig` from DEFAULT_CONFIG as a base, overlaying
only the fields the user touched. This means tax bands, withdrawal_priority, etc.
are inherited from DEFAULT_CONFIG and are adjustable via ConfigPanel afterwards.

```tsx
// src/components/onboarding/OnboardingWizard.tsx
// Full implementation outline — see below for each step's JSX.

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useConfig } from '../../store/configStore';
import { DEFAULT_CONFIG } from '../../store/configStore';
import type { PlannerConfig } from '../../engine/types';

const TOTAL_STEPS = 5;

// ---- Step sub-components (inline for brevity) ----

interface StepProps {
  data: Partial<WizardData>;
  onChange: (key: keyof WizardData, value: string | number | boolean) => void;
}

interface WizardData {
  dob: string;
  retirementDate: string;
  endAge: number;
  targetNetAnnual: number;
  cpiRate: number;
  hasStatePension: boolean;
  statePensionGross: number;
  statePensionStart: string;
  hasDcPot: boolean;
  dcPotName: string;
  dcPotBalance: number;
  dcGrowthRate: number;
  dcFees: number;
  hasIsa: boolean;
  isaBalance: number;
  isaGrowthRate: number;
}

function buildConfig(data: WizardData): PlannerConfig {
  const base: PlannerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  base.personal.date_of_birth = data.dob;
  base.personal.retirement_date = data.retirementDate;
  base.personal.end_age = data.endAge;
  base.target_income.net_annual = data.targetNetAnnual;
  base.target_income.cpi_rate = data.cpiRate;

  base.guaranteed_income = data.hasStatePension ? [{
    ...DEFAULT_CONFIG.guaranteed_income[0]!,
    gross_annual: data.statePensionGross,
    start_date: data.statePensionStart,
  }] : [];

  base.dc_pots = data.hasDcPot ? [{
    name: data.dcPotName,
    starting_balance: data.dcPotBalance,
    growth_rate: data.dcGrowthRate,
    annual_fees: data.dcFees,
    tax_free_portion: 0.25,
    values_as_of: new Date().toISOString().slice(0, 7),
  }] : [];

  base.tax_free_accounts = data.hasIsa ? [{
    name: 'ISA',
    starting_balance: data.isaBalance,
    growth_rate: data.isaGrowthRate,
    values_as_of: new Date().toISOString().slice(0, 7),
  }] : [];

  base.withdrawal_priority = [
    ...(data.hasDcPot ? [data.dcPotName] : []),
    ...(data.hasIsa ? ['ISA'] : []),
  ];

  return base;
}

export default function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const { setConfig, markConfigured } = useConfig();
  const [step, setStep] = useState(1);
  const NOW = new Date().toISOString().slice(0, 7);

  const [data, setData] = useState<WizardData>({
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
  });

  function onChange(key: keyof WizardData, value: string | number | boolean) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function handleFinish() {
    const cfg = buildConfig(data);
    setConfig(cfg);
    markConfigured();
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-8 space-y-6">

        {/* Progress */}
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i + 1 <= step ? 'bg-emerald-500' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 1 && <StepAboutYou data={data} onChange={onChange} />}
        {step === 2 && <StepTargetIncome data={data} onChange={onChange} />}
        {step === 3 && <StepStatePension data={data} onChange={onChange} />}
        {step === 4 && <StepDcPot data={data} onChange={onChange} />}
        {step === 5 && <StepIsa data={data} onChange={onChange} />}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="flex items-center gap-1 text-gray-400 hover:text-white disabled:opacity-30
                       transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white
                         px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white
                         px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Check className="w-4 h-4" /> Finish
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ---- Step sub-components ----
// Each is a small form section. Use standard Tailwind form styling
// consistent with ConfigPanel (label above, input below, text-gray-300 labels,
// bg-gray-800 inputs, border-gray-600, rounded).

function StepAboutYou({ data, onChange }: StepProps) { /* ... */ }
function StepTargetIncome({ data, onChange }: StepProps) { /* ... */ }
function StepStatePension({ data, onChange }: StepProps) { /* ... */ }
function StepDcPot({ data, onChange }: StepProps) { /* ... */ }
function StepIsa({ data, onChange }: StepProps) { /* ... */ }
```

Each step sub-component should follow the form field pattern used in ConfigPanel:
- `<label className="block text-sm text-gray-300 mb-1">`
- `<input className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm">`

**Step 3: Run full test suite**

Run: `npm test`
Expected: all passing

**Step 4: Commit**

```
git add src/components/onboarding/OnboardingWizard.tsx
git commit -m "feat: add OnboardingWizard component"
```

---

## Task 5: Wire WelcomeScreen and OnboardingWizard into App.tsx

**Objective:** App routes to WelcomeScreen when isFirstVisit=true; otherwise normal layout.

**Files:**
- Modify: `src/App.tsx`

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import WhatIf from './pages/WhatIf'
import Review from './pages/Review'
import Optimise from './pages/Optimise'
import WelcomeScreen from './pages/WelcomeScreen'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import { useConfig } from './store/configStore'
import { importConfigFromFile } from './store/configStore'

function App() {
  const { isFirstVisit, setConfig, markConfigured } = useConfig()
  const [showWizard, setShowWizard] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  function handleLoadFile() {
    setImportError(null)
    importConfigFromFile()
      .then(cfg => {
        setConfig(cfg)
        markConfigured()
      })
      .catch(err => setImportError(err.message))
  }

  if (isFirstVisit) {
    return (
      <>
        <WelcomeScreen
          onLoadFile={handleLoadFile}
          onStartWizard={() => setShowWizard(true)}
          importError={importError}
        />
        {showWizard && (
          <OnboardingWizard onDone={() => setShowWizard(false)} />
        )}
      </>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="what-if" element={<WhatIf />} />
        <Route path="optimise" element={<Optimise />} />
        <Route path="review" element={<Review />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: all passing

**Step 4: Commit**

```
git add src/App.tsx
git commit -m "feat: show WelcomeScreen on first visit, wire wizard"
```

---

## Task 6: Add "Load Config" confirmation dialog on dashboard

**Objective:** Warn the returning user before their active config is replaced by an import.

**Files:**
- Modify: `src/components/dashboard/ConfigPanel.tsx`

Replace the existing `handleImport` function with one that shows a browser-native
confirm dialog (no new component needed — keep it simple):

```ts
function handleImport() {
  const confirmed = window.confirm(
    'This will replace your current config with the file you select. Continue?'
  )
  if (!confirmed) return
  setImportError(null)
  importConfigFromFile()
    .then(cfg => { setConfig(cfg); })
    .catch(err => { setImportError(err.message); })
}
```

This covers STATE 2 (dashboard user replacing their existing config). The welcome
screen import (STATE 1) does NOT need this confirmation because there is nothing
to overwrite.

**Step 3: Run full test suite**

Run: `npm test`
Expected: all passing

**Step 4: Commit**

```
git add src/components/dashboard/ConfigPanel.tsx
git commit -m "feat: add confirmation dialog before dashboard config import"
```

---

## Task 7: "Save backup" prompt after wizard completes

**Objective:** First natural touchpoint for getting users to export their config.

**Files:**
- Modify: `src/components/onboarding/OnboardingWizard.tsx`

After `handleFinish()` saves the config and calls `markConfigured()`, offer to
download a backup. Replace `handleFinish`:

```ts
import { exportConfigToFile } from '../../store/configStore'

function handleFinish() {
  const cfg = buildConfig(data)
  setConfig(cfg)
  markConfigured()
  const wantsBackup = window.confirm(
    'Setup complete! Would you like to save a backup of your config now?\n\n' +
    'You can always export later from the Config panel.'
  )
  if (wantsBackup) exportConfigToFile(cfg)
  onDone()
}
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: all passing

**Step 4: Commit**

```
git add src/components/onboarding/OnboardingWizard.tsx
git commit -m "feat: prompt user to save backup after wizard completes"
```

---

## Task 8: "Reset / Start over" in header

**Objective:** Let returning users wipe their config and return to the welcome screen.

**Files:**
- Modify: `src/components/Layout.tsx`

Add a "Reset" button (or small icon button) in the header. When clicked, confirm
then call `resetToDefault()`. Because `resetToDefault()` now sets `isFirstVisit=true`
(from Task 2), the app will re-render the WelcomeScreen automatically.

```tsx
// Inside Layout.tsx header area
const { resetToDefault } = useConfig()

function handleReset() {
  const confirmed = window.confirm(
    'This will clear all your settings and return to the welcome screen. Continue?'
  )
  if (confirmed) resetToDefault()
}

// In JSX — add to existing header nav:
<button
  onClick={handleReset}
  className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-4"
  title="Reset all settings"
>
  Reset
</button>
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: all passing

**Step 4: Commit**

```
git add src/components/Layout.tsx
git commit -m "feat: add Reset button to header — returns to welcome screen"
```

---

## Summary

After all 8 tasks, the app flow is:

  First visit / after reset
    -> WelcomeScreen
       -> "Restore from file" -> importConfigFromFile -> dashboard
       -> "Set up from scratch" -> OnboardingWizard (5 steps)
                                -> optional backup export
                                -> dashboard

  Returning visit (localStorage exists)
    -> dashboard (as before)
    -> "Load Config" button in ConfigPanel (with confirmation dialog)
    -> "Reset" in header -> WelcomeScreen

New files:
  src/store/__tests__/configStore.test.ts
  src/pages/WelcomeScreen.tsx
  src/components/onboarding/OnboardingWizard.tsx

Modified files:
  src/store/configStore.ts       (hasStoredConfig, extended interface)
  src/store/ConfigProvider.tsx   (isFirstVisit, markConfigured)
  src/App.tsx                    (conditional routing)
  src/components/dashboard/ConfigPanel.tsx  (import confirmation)
  src/components/Layout.tsx      (reset button)

All existing tests must remain green throughout.
