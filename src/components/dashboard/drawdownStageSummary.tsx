import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useConfig } from '../../store/configStore';
import type { DrawdownStageConfig, PlannerConfig } from '../../engine/types';
import {
  appendDrawdownStage,
  appendSourceToDrawdownStage,
  displayNameForDrawdownStage,
  moveDrawdownStage,
  normalizeConfigDrawdownStages,
  removeDrawdownStageAt,
  removeSourceFromDrawdownStage,
  updateDrawdownStageName,
  updateDrawdownStageSourceShare,
  validateDrawdownStages,
} from '../../engine/drawdownStages';

type Variant = 'summary' | 'editor';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function formatDrawdownStageSummary(stage: DrawdownStageConfig, index: number): string {
  const stageName = displayNameForDrawdownStage(stage, index);
  const sourceSummary = stage.sources
    .map(source => `${source.source_name} ${(source.target_share * 100).toFixed(1)}%`)
    .join(' + ');
  return `${stageName} — ${sourceSummary || 'No sources configured'}`;
}

export function formatDrawdownStrategySummary(stages: DrawdownStageConfig[]): string {
  return stages.map((stage, index) => formatDrawdownStageSummary(stage, index)).join('; ');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function sourceValue(source: { source_type: string; source_name: string }): string {
  return `${source.source_type}:${source.source_name}`;
}

function sourceOptionsForConfig(config: PlannerConfig) {
  return [
    ...(config.dc_pots ?? []).map(pot => ({
      value: `dc_pot:${pot.name}`,
      name: pot.name,
      label: `${pot.name} (DC pension)`,
    })),
    ...(config.tax_free_accounts ?? []).map(account => ({
      value: `tax_free_account:${account.name}`,
      name: account.name,
      label: `${account.name} (tax-free account)`,
    })),
  ];
}

export default function DrawdownStagesPanel({ variant }: { variant: Variant }) {
  const { config, updateConfig } = useConfig();
  const stages = normalizeConfigDrawdownStages(deepClone(config) as PlannerConfig).drawdown_stages ?? [];
  const sourceOptions = sourceOptionsForConfig(config);
  const validationMessages = validateDrawdownStages({
    dc_pots: config.dc_pots,
    tax_free_accounts: config.tax_free_accounts,
    drawdown_stages: stages,
  });

  if (variant === 'summary') {
    return (
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Drawdown strategy
        </h4>
        <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p className="text-xs text-gray-500 mb-1">
            Active source order/blending used by the projection.
          </p>
          <p className="text-xs text-gray-700 leading-relaxed">
            {formatDrawdownStrategySummary(stages)}
          </p>
          <Link to="/optimise" className="inline-block mt-2 text-xs font-medium text-blue-600 hover:text-blue-800">
            Edit drawdown strategy in Optimise →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Drawdown order and blending</h2>
      <p className="text-xs text-gray-400 mb-3">
        Top stage funds withdrawals first. One source behaves like the old priority order; multiple sources in one stage are blended by the percentages shown.
      </p>
      {validationMessages.length > 0 && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <p className="font-medium">Drawdown stage setup needs attention:</p>
          <ul className="list-disc pl-4">
            {validationMessages.map(message => <li key={message}>{message}</li>)}
          </ul>
        </div>
      )}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => updateConfig(prev => {
            const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
            appendDrawdownStage(next);
            return next;
          })}
          className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          <Plus className="w-3 h-3" />
          Add stage
        </button>
      </div>
      <div className="space-y-2">
        {stages.map((stage, i, allStages) => {
          const stageLabel = displayNameForDrawdownStage(stage, i);
          const shareTotal = stage.sources.reduce((total, source) => total + source.target_share, 0);
          const shareTotalOk = Math.abs(shareTotal - 1) <= 0.000001;
          const sourceKeysInStage = new Set(stage.sources.map(sourceValue));
          const addableSources = sourceOptions.filter(option => !sourceKeysInStage.has(option.value));
          return (
            <div key={stage.id} className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-gray-400 w-4 pt-6">{i + 1}.</span>
                <div className="flex-1 space-y-2">
                  <Field label="Stage name">
                    <input
                      type="text"
                      value={stage.name ?? ''}
                      placeholder={stageLabel}
                      onChange={e => updateConfig(prev => {
                        const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
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
                    {stage.sources.length === 0 && (
                      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                        Add a source to this stage.
                      </p>
                    )}
                    {stage.sources.map((source, sourceIndex) => (
                      <div key={`${source.source_type}:${source.source_name}`} className="grid grid-cols-[1fr_5rem_auto] gap-2 items-center">
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
                              const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
                              updateDrawdownStageSourceShare(next, i, sourceIndex, Number(e.target.value) / 100);
                              return next;
                            })}
                            className="input-field pr-6 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateConfig(prev => {
                            const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
                            removeSourceFromDrawdownStage(next, i, sourceIndex);
                            return next;
                          })}
                          className="text-[11px] text-red-500 hover:text-red-700"
                        >
                          Remove {source.source_name} from {stageLabel}
                        </button>
                      </div>
                    ))}
                    <select
                      aria-label={`Add source to ${stageLabel}`}
                      value=""
                      disabled={addableSources.length === 0}
                      onChange={e => {
                        const selected = sourceOptions.find(option => option.value === e.target.value);
                        if (!selected) return;
                        updateConfig(prev => {
                          const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
                          appendSourceToDrawdownStage(next, i, selected.name);
                          return next;
                        });
                      }}
                      className="input-field text-xs disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">Add source…</option>
                      {addableSources.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1 pt-6">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => updateConfig(prev => {
                      const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
                      moveDrawdownStage(next, i, -1);
                      return next;
                    })}
                    className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    title="Move stage up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === allStages.length - 1}
                    onClick={() => updateConfig(prev => {
                      const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
                      moveDrawdownStage(next, i, 1);
                      return next;
                    })}
                    className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    title="Move stage down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConfig(prev => {
                      const next = normalizeConfigDrawdownStages(deepClone(prev) as PlannerConfig);
                      removeDrawdownStageAt(next, i);
                      return next;
                    })}
                    className="inline-flex items-center gap-1 p-0.5 text-[11px] text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete stage
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
