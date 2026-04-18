import { useState, useCallback, useMemo } from 'react';
import { Save, RotateCcw, Trash2, Pencil, Check, X, Shield, Trophy } from 'lucide-react';
import { useConfig } from '../store/configStore';
import { useProjection } from '../hooks/useProjection';
import { getStrategyDisplayName } from '../engine/strategies';
import SandboxControls from '../components/whatif/SandboxControls';
import SummaryCards from '../components/dashboard/SummaryCards';
import ProjectionChart from '../components/dashboard/ProjectionChart';
import YearTable from '../components/dashboard/YearTable';
import ComparePanel from '../components/whatif/ComparePanel';
import type { CompareItem } from '../components/whatif/ComparePanel';
import StressTestPanel from '../components/whatif/StressTestPanel';
import ShootoutPanel from '../components/whatif/ShootoutPanel';
import type { PlannerConfig } from '../engine/types';
import {
  loadScenarios,
  saveScenario,
  deleteScenario,
  renameScenario,
  type Scenario,
} from '../store/scenarioStore';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function WhatIf() {
  const { config: dashboardConfig } = useConfig();

  // Sandbox config — starts as a copy of the dashboard config
  const [sandboxConfig, setSandboxConfig] = useState<PlannerConfig>(() =>
    deepClone(dashboardConfig),
  );

  // Scenario list
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios());

  // Save-scenario input
  const [saveName, setSaveName] = useState('');

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Stress / Shootout visibility
  const [showStress, setShowStress] = useState(false);
  const [showShootout, setShowShootout] = useState(false);

  // Compare mode: selected scenario IDs (+ special 'sandbox' key)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Build compare items from selected IDs
  const compareItems: CompareItem[] = useMemo(() => {
    const items: CompareItem[] = [];
    if (selectedIds.has('sandbox')) {
      items.push({ name: 'Sandbox', config: sandboxConfig });
    }
    for (const sc of scenarios) {
      if (selectedIds.has(sc.id)) {
        items.push({ name: sc.name, config: sc.config });
      }
    }
    return items;
  }, [selectedIds, scenarios, sandboxConfig]);

  const compareMode = compareItems.length >= 2;

  // Extend projection 5 years beyond plan end for chart visibility
  const EXTRA_YEARS = 5;
  const extendedConfig = useMemo(() => {
    const cfg = deepClone(sandboxConfig);
    (cfg as unknown as Record<string, unknown>).projection_end_age =
      cfg.personal.end_age + EXTRA_YEARS;
    return cfg;
  }, [sandboxConfig]);

  // Run projection on the extended config (instant — no button needed)
  const result = useProjection(extendedConfig);
  const strategyId = sandboxConfig.drawdown_strategy ?? 'fixed_target';

  // Reset sandbox to current dashboard config
  const resetSandbox = useCallback(() => {
    setSandboxConfig(deepClone(dashboardConfig));
  }, [dashboardConfig]);

  // Save sandbox config as a named scenario
  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    const sc = saveScenario(name, sandboxConfig);
    setScenarios(prev => [...prev, sc]);
    setSaveName('');
  }, [saveName, sandboxConfig]);

  // Delete a scenario
  const handleDelete = useCallback((id: string) => {
    const updated = deleteScenario(id);
    setScenarios(updated);
  }, []);

  // Rename a scenario
  const handleRename = useCallback((id: string) => {
    const newName = renameValue.trim();
    if (!newName) return;
    const updated = renameScenario(id, newName);
    setScenarios(updated);
    setRenamingId(null);
    setRenameValue('');
  }, [renameValue]);

  // Load a scenario into the sandbox
  const loadIntoSandbox = useCallback((sc: Scenario) => {
    setSandboxConfig(deepClone(sc.config));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">What If</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Explore scenarios without changing your dashboard settings.
        </p>
      </div>

      {/* Sandbox Controls */}
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-amber-800">
            Sandbox
          </h2>
          <button
            onClick={resetSandbox}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            title="Reset to dashboard settings"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        <SandboxControls config={sandboxConfig} onChange={setSandboxConfig} />

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowStress(v => !v); setShowShootout(false); }}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                showStress
                  ? 'bg-red-600 text-white'
                  : 'border border-red-300 text-red-700 hover:bg-red-50'
              }`}
              title="Test against 100+ historical periods"
            >
              <Shield className="w-3.5 h-3.5" />
              Stress Test
            </button>
            <button
              onClick={() => { setShowShootout(v => !v); setShowStress(false); }}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                showShootout
                  ? 'bg-cyan-600 text-white'
                  : 'border border-cyan-300 text-cyan-700 hover:bg-cyan-50'
              }`}
              title="Compare all strategies under historical stress"
            >
              <Trophy className="w-3.5 h-3.5" />
              Shootout
            </button>
          </div>
          <div className="w-px h-6 bg-amber-200 mx-1" />
        </div>

        {/* Save as scenario */}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Name this scenario…"
            className="input-field flex-1 max-w-xs"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Scenario
          </button>
        </div>
      </div>

      {/* Stress Test Panel */}
      {showStress && (
        <StressTestPanel config={sandboxConfig} />
      )}

      {/* Strategy Shootout Panel */}
      {showShootout && (
        <ShootoutPanel config={sandboxConfig} />
      )}

      {/* Live Projection Results */}
      {!showStress && !showShootout && (
        <>
          <SummaryCards summary={result.summary} />
          <ProjectionChart
            years={result.years}
            summary={result.summary}
            strategyName={getStrategyDisplayName(strategyId)}
          />
          <YearTable years={result.years} />
        </>
      )}

      {/* Saved Scenarios + Compare Selection */}
      {scenarios.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Saved Scenarios
            </h2>
            {selectedIds.size > 0 && (
              <span className="text-xs text-blue-600 font-medium">
                {selectedIds.size} selected{compareMode ? '' : ' — select 1 more to compare'}
              </span>
            )}
          </div>

          {/* Sandbox compare checkbox */}
          <div className="mb-3">
            <label
              className={`inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm cursor-pointer transition-all ${
                selectedIds.has('sandbox')
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-200 hover:border-amber-300'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has('sandbox')}
                onChange={() => toggleSelected('sandbox')}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span className="font-medium text-amber-800">Current Sandbox</span>
              <span className="text-xs text-gray-500">
                {getStrategyDisplayName(strategyId)} · End {sandboxConfig.personal.end_age}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scenarios.map(sc => {
              const sId = sc.config.drawdown_strategy ?? 'fixed_target';
              const isRenaming = renamingId === sc.id;
              const isSelected = selectedIds.has(sc.id);
              return (
                <div
                  key={sc.id}
                  className={`rounded-lg border-2 p-3 transition-all ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50/50 shadow-sm'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {/* Checkbox + Name row */}
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(sc.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                      onClick={e => e.stopPropagation()}
                    />
                    {isRenaming ? (
                      <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(sc.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="input-field text-sm flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRename(sc.id)}
                          className="p-1 text-green-600 hover:text-green-800"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3
                        className="text-sm font-semibold text-gray-800 truncate flex-1 cursor-pointer"
                        onClick={() => loadIntoSandbox(sc)}
                        title="Click to load into sandbox"
                      >
                        {sc.name}
                      </h3>
                    )}

                    {!isRenaming && (
                      <div className="flex items-center gap-0.5 ml-auto">
                        <button
                          onClick={e => { e.stopPropagation(); setRenamingId(sc.id); setRenameValue(sc.name); }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(sc.id); }}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick metrics */}
                  <p className="text-xs text-gray-500 ml-6">
                    {getStrategyDisplayName(sId)} · End {sc.config.personal.end_age}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 ml-6">
                    {new Date(sc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compare Panel */}
      {compareMode && (
        <ComparePanel items={compareItems} />
      )}
    </div>
  );
}
