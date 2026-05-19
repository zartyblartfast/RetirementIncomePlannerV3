import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useConfig } from '../../store/configStore';
import type { DrawdownStageConfig, PensionAccessEventConfig, PlannerConfig } from '../../engine/types';
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
import { validatePensionAccessEvents } from '../../engine/pensionAccessEvents';

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
  const activeStages = stages.filter(stage => Array.isArray(stage.sources) && stage.sources.length > 0);
  if (activeStages.length === 0) return 'No projection-ready drawdown stages configured';
  return activeStages.map((stage, index) => formatDrawdownStageSummary(stage, index)).join('; ');
}

export function formatDrawdownStageMode(stage: DrawdownStageConfig): string {
  if (!Array.isArray(stage.sources) || stage.sources.length === 0) return 'Draft stage';
  return stage.sources.length === 1 ? 'Single-source stage' : 'Blended stage';
}

export function formatDrawdownStageDetail(stage: DrawdownStageConfig, index: number): string {
  const stageName = displayNameForDrawdownStage(stage, index);
  if (!Array.isArray(stage.sources) || stage.sources.length === 0) {
    return `${stageName}: draft stage with no source yet`;
  }
  const sourceDetail = stage.sources
    .map(source => `${(source.target_share * 100).toFixed(1)}% ${source.source_name}`)
    .join(' + ');
  return `${stageName}: ${formatDrawdownStageMode(stage).toLowerCase()} using ${sourceDetail}`;
}

export function formatDrawdownStageValidationMessages(config: Pick<PlannerConfig, 'dc_pots' | 'tax_free_accounts'>, stages: DrawdownStageConfig[]): string[] {
  const messages: string[] = [];
  const ids = new Set<string>();
  const dcNames = new Set((config.dc_pots ?? []).map(pot => pot.name));
  const taxFreeNames = new Set((config.tax_free_accounts ?? []).map(account => account.name));

  stages.forEach((stage, index) => {
    const label = displayNameForDrawdownStage(stage, index);
    const id = typeof stage.id === 'string' && stage.id.trim() !== '' ? stage.id : '';
    if (!id) {
      messages.push(`${label} needs an internal stage ID. Save/reload repair should normally fix this.`);
    } else if (ids.has(id)) {
      messages.push(`${label} has the same internal ID as another stage (${id}).`);
    } else {
      ids.add(id);
    }

    if (!Array.isArray(stage.sources) || stage.sources.length === 0) {
      messages.push(`${label} needs at least one source before it can be used in projections.`);
      return;
    }

    const sourceKeys = new Set<string>();
    let shareTotal = 0;
    stage.sources.forEach(source => {
      shareTotal += Number.isFinite(source.target_share) ? source.target_share : 0;
      const key = sourceValue(source);
      if (sourceKeys.has(key)) {
        messages.push(`${label} includes ${source.source_name} more than once. Move or remove the duplicate source.`);
      } else {
        sourceKeys.add(key);
      }
      if (source.source_type === 'dc_pot' && !dcNames.has(source.source_name)) {
        messages.push(`${label} references missing DC pension source: ${source.source_name}.`);
      } else if (source.source_type === 'tax_free_account' && !taxFreeNames.has(source.source_name)) {
        messages.push(`${label} references missing tax-free source: ${source.source_name}.`);
      } else if (source.source_type !== 'dc_pot' && source.source_type !== 'tax_free_account') {
        messages.push(`${label} has an unknown source type for ${source.source_name}.`);
      }
    });

    if (Math.abs(shareTotal - 1) > 0.000001) {
      messages.push(`${label} source shares total ${(shareTotal * 100).toFixed(1)}%; they need to total 100.0%.`);
    }
  });

  return messages;
}

function fmtGBP(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function formatPensionAccessEventType(event: PensionAccessEventConfig): string {
  switch (event.event_type) {
    case 'tax_free_cash': return 'tax-free cash';
    case 'ordinary_drawdown_marker': return 'ordinary drawdown marker';
    case 'already_taken_marker': return 'already-taken marker';
  }
}

function formatPensionAccessTiming(event: PensionAccessEventConfig): string {
  switch (event.timing.kind) {
    case 'retirement_date': return 'at the plan retirement date';
    case 'plan_start': return 'at the plan start';
    case 'date': return `in ${event.timing.date}`;
    case 'age': return `at age ${event.timing.age}`;
    case 'first_drawdown_from_pot': return 'when this pot first enters ordinary drawdown';
  }
}

function formatPensionAccessAmount(event: PensionAccessEventConfig): string {
  switch (event.amount.kind) {
    case 'fixed_amount': return fmtGBP(event.amount.value);
    case 'percentage_of_pot': return `${(event.amount.value * 100).toFixed(1)}% of selected pot value at the event date`;
    case 'percentage_of_estimated_tfc_remaining': return `${(event.amount.value * 100).toFixed(1)}% of estimated remaining tax-free cash from this pot`;
  }
}

function formatPensionAccessDestination(event: PensionAccessEventConfig): string {
  const destination = event.destination ?? { kind: 'outside_plan' as const };
  switch (destination.kind) {
    case 'outside_plan': return 'outside the plan';
    case 'held_as_cash_event': return 'as an off-plan cash event';
    case 'tax_free_account': return destination.target_ref ? `to ${destination.target_ref}` : 'to a tax-free account';
    case 'cash_account': return destination.target_ref ? `to ${destination.target_ref}` : 'to a cash account';
  }
}

export function formatPensionAccessEventSummary(event: PensionAccessEventConfig, index: number): string {
  return `Event ${index + 1}: ${event.pot_ref} — ${formatPensionAccessEventType(event)} ${formatPensionAccessTiming(event)}, ${formatPensionAccessAmount(event)} paid ${formatPensionAccessDestination(event)}`;
}

function nextPensionAccessEventId(events: PensionAccessEventConfig[]): string {
  const existing = new Set(events.map(event => event.id));
  let index = events.length + 1;
  let id = `pension_access_event_${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `pension_access_event_${index}`;
  }
  return id;
}

function appendDefaultPensionAccessEvent(config: PlannerConfig): PlannerConfig {
  const pot = config.dc_pots[0];
  if (!pot) return config;
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  return {
    ...config,
    pension_access_events: [
      ...events,
      {
        id: nextPensionAccessEventId(events),
        pot_ref: pot.name,
        event_type: 'tax_free_cash',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
        destination: { kind: 'outside_plan' },
      },
    ],
  };
}

function updatePensionAccessEventAt(
  config: PlannerConfig,
  eventIndex: number,
  updater: (event: PensionAccessEventConfig) => PensionAccessEventConfig,
): PlannerConfig {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  return {
    ...config,
    pension_access_events: events.map((event, index) => index === eventIndex ? updater(event) : event),
  };
}

function removePensionAccessEventAt(config: PlannerConfig, eventIndex: number): PlannerConfig {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  const nextEvents = events.filter((_, index) => index !== eventIndex);
  if (nextEvents.length === 0) {
    const { pension_access_events: _events, ...rest } = config;
    return rest;
  }
  return { ...config, pension_access_events: nextEvents };
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
  const pensionAccessEvents = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  const pensionAccessValidationMessages = validatePensionAccessEvents(config).map(issue => issue.message);
  const validationMessages = formatDrawdownStageValidationMessages({
    dc_pots: config.dc_pots,
    tax_free_accounts: config.tax_free_accounts,
  }, stages);
  const hasValidationIssues = validationMessages.length > 0 || pensionAccessValidationMessages.length > 0 || validateDrawdownStages({
    dc_pots: config.dc_pots,
    tax_free_accounts: config.tax_free_accounts,
    drawdown_stages: stages,
  }).length > 0;

  if (variant === 'summary') {
    return (
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Drawdown strategy
        </h4>
        <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p className="text-xs text-gray-500 mb-1">
            Active source order/blending used by the projection. Draft empty stages are edited on the Strategy page and are not listed here.
          </p>
          <p className="text-xs text-gray-700 leading-relaxed">
            {formatDrawdownStrategySummary(stages)}
          </p>
          <Link to="/optimise" className="inline-block mt-2 text-xs font-medium text-blue-600 hover:text-blue-800">
            Edit drawdown order and blending →
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
      <div className="mb-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <p className="font-medium mb-1">How staged drawdown is used</p>
        <p className="text-blue-700">
          The projection works through these stages from top to bottom. A single source is sequential drawdown; multiple sources in the same stage are blended by the shown percentages. If one source depletes, the remaining available sources in that stage are rebalanced before moving to the next stage.
        </p>
        {stages.length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-blue-700 space-y-0.5">
            {stages.map((stage, index) => (
              <li key={stage.id}>{formatDrawdownStageDetail(stage, index)}</li>
            ))}
          </ul>
        )}
      </div>
      {hasValidationIssues && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <p className="font-medium">Drawdown stage setup needs attention:</p>
          <p className="mb-1">Resolve these before relying on the projection output.</p>
          <ul className="list-disc pl-4">
            {validationMessages.map(message => <li key={message}>{message}</li>)}
            {pensionAccessValidationMessages.map(message => <li key={message}>{message}</li>)}
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

      <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-emerald-900">Pension access / tax-free cash events</h3>
            <p className="mt-1 text-xs text-emerald-800">
              Optional one-off capital events, separate from ordinary staged income withdrawals. These events can reduce the selected pension pot and appear in Year Workings, but they are not treated as ordinary income or taxable drawdown.
            </p>
          </div>
          <button
            type="button"
            disabled={(config.dc_pots ?? []).length === 0}
            onClick={() => updateConfig(prev => appendDefaultPensionAccessEvent(deepClone(prev) as PlannerConfig))}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Add TFC event
          </button>
        </div>
        <p className="mt-2 text-[11px] text-emerald-700">
          Initial simplified model: no LSA/LSDBA/provider/MPAA tracking, and destinations inside the plan are not yet financially modelled. Use adviser review before relying on the treatment.
        </p>
        {pensionAccessEvents.length === 0 ? (
          <p className="mt-3 rounded border border-emerald-100 bg-white px-2 py-1 text-xs text-emerald-700">
            No pension access events configured. Ordinary withdrawals still use each pot's gradual pro-rata tax-free cash assumption.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {pensionAccessEvents.map((event, eventIndex) => (
              <div key={event.id} className="rounded border border-emerald-100 bg-white px-3 py-2 text-xs text-gray-700">
                <p className="mb-2 font-medium text-emerald-900">{formatPensionAccessEventSummary(event, eventIndex)}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  <Field label="Pension pot">
                    <select
                      value={event.pot_ref}
                      onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => ({ ...current, pot_ref: e.target.value })))}
                      className="input-field text-xs"
                    >
                      {(config.dc_pots ?? []).map(pot => (
                        <option key={pot.name} value={pot.name}>{pot.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Timing">
                    <select
                      value={event.timing.kind}
                      onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => {
                        const kind = e.target.value;
                        if (kind === 'date') return { ...current, timing: { kind: 'date', date: prev.personal.retirement_date } };
                        if (kind === 'age') return { ...current, timing: { kind: 'age', age: Math.max(0, Math.round(new Date(prev.personal.retirement_date + '-01').getFullYear() - new Date(prev.personal.date_of_birth + '-01').getFullYear())) } };
                        if (kind === 'plan_start') return { ...current, timing: { kind: 'plan_start' } };
                        if (kind === 'first_drawdown_from_pot') return { ...current, timing: { kind: 'first_drawdown_from_pot' } };
                        return { ...current, timing: { kind: 'retirement_date' } };
                      }))}
                      className="input-field text-xs"
                    >
                      <option value="retirement_date">Plan retirement date</option>
                      <option value="date">Specific date</option>
                      <option value="age">Specific age</option>
                    </select>
                  </Field>
                  {event.timing.kind === 'date' && (
                    <Field label="Event date">
                      <input
                        type="month"
                        value={event.timing.date}
                        onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => ({ ...current, timing: { kind: 'date', date: e.target.value } })))}
                        className="input-field text-xs"
                      />
                    </Field>
                  )}
                  {event.timing.kind === 'age' && (
                    <Field label="Event age">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={event.timing.age}
                        onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => ({ ...current, timing: { kind: 'age', age: Number(e.target.value) } })))}
                        className="input-field text-xs"
                      />
                    </Field>
                  )}
                  <Field label="Amount basis">
                    <select
                      value={event.amount.kind}
                      onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => {
                        const kind = e.target.value;
                        if (kind === 'fixed_amount') return { ...current, amount: { kind: 'fixed_amount', value: 10000 } };
                        if (kind === 'percentage_of_pot') return { ...current, amount: { kind: 'percentage_of_pot', value: 0.25 } };
                        return { ...current, amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 } };
                      }))}
                      className="input-field text-xs"
                    >
                      <option value="percentage_of_estimated_tfc_remaining">% of selected pot's estimated remaining TFC</option>
                      <option value="percentage_of_pot">% of selected pot value</option>
                      <option value="fixed_amount">Fixed amount</option>
                    </select>
                  </Field>
                  <Field label={event.amount.kind === 'fixed_amount' ? 'Amount (£)' : 'Percentage (%)'}>
                    <input
                      type="number"
                      min={0}
                      step={event.amount.kind === 'fixed_amount' ? 100 : 0.1}
                      value={event.amount.kind === 'fixed_amount' ? event.amount.value : event.amount.value * 100}
                      onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => ({
                        ...current,
                        amount: current.amount.kind === 'fixed_amount'
                          ? { kind: 'fixed_amount', value: Number(e.target.value) }
                          : { kind: current.amount.kind, value: Number(e.target.value) / 100 },
                      })))}
                      className="input-field text-xs"
                    />
                  </Field>
                  <Field label="Destination">
                    <select value={event.destination?.kind ?? 'outside_plan'} disabled className="input-field text-xs disabled:bg-gray-100 disabled:text-gray-500">
                      <option value="outside_plan">Outside plan / not reinvested here yet</option>
                      <option value="held_as_cash_event">Off-plan cash event</option>
                      <option value="tax_free_account">Tax-free account destination (future modelling)</option>
                      <option value="cash_account">Cash account destination (future modelling)</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-2 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                  <p className="font-medium">Capital event treatment</p>
                  <p>Reduces the selected pension pot balance. Does not count as ordinary income, taxable income, or taxable drawdown.</p>
                  <p>Selected pot context: % options are calculated against the pension pot chosen above.</p>
                  <p><span className="font-medium">Currently modelled as: outside-plan cash, informational only.</span> Released cash is not yet added to a modelled cash, ISA, or other destination account.</p>
                  <p>In-plan destination flows are a separate follow-up.</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig(prev => removePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex))}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove TFC event
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
