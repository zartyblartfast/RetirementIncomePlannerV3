import { Plus, Trash2 } from 'lucide-react';
import { validatePensionAccessEvents, type PensionAccessEventValidationIssue } from '../../engine/pensionAccessEvents';
import type { DCPotPensionAccessConfig, PensionAccessEventConfig, PensionAccessEventType, PlannerConfig } from '../../engine/types';
import { useConfig } from '../../store/configStore';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function fmtGBP(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function formatPensionAccessEventType(event: PensionAccessEventConfig): string {
  switch (event.event_type) {
    case 'tax_free_cash': return 'tax-free cash';
    case 'crystallise_and_take_pcls': return 'crystallise and take PCLS';
    case 'ufpls': return 'UFPLS';
    case 'taxable_flexi_access_drawdown': return 'taxable flexi-access drawdown';
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

export function formatPensionAccessValidationMessage(issue: PensionAccessEventValidationIssue, eventIndex: number): string {
  const eventLabel = `Event ${eventIndex + 1}`;
  switch (issue.code) {
    case 'duplicate_event_id':
      return `${eventLabel}: duplicate internal event ID. Remove and re-add this event if it was copied from another case.`;
    case 'missing_pot_ref':
      return `${eventLabel}: selected pension pot “${issue.pot_ref ?? issue.event_id}” was not found. Choose an existing DC pension pot.`;
    case 'invalid_fixed_amount':
      return `${eventLabel}: fixed amount must be more than £0.`;
    case 'invalid_percentage_amount':
      return `${eventLabel}: percentage must be more than 0% and no more than 100% of the selected pot/basis.`;
    case 'missing_destination_target':
      return `${eventLabel}: in-plan destination is incomplete. Keep Outside plan selected, or choose a destination account when destination modelling is available.`;
  }
}

export function nextPensionAccessEventId(events: PensionAccessEventConfig[]): string {
  const existing = new Set(events.map(event => event.id));
  let index = events.length + 1;
  let id = `pension_access_event_${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `pension_access_event_${index}`;
  }
  return id;
}

export function defaultPensionAccessEventForType(
  config: PlannerConfig,
  events: PensionAccessEventConfig[],
  eventType: Extract<PensionAccessEventType, 'tax_free_cash' | 'crystallise_and_take_pcls' | 'taxable_flexi_access_drawdown'>,
): PensionAccessEventConfig | null {
  const pot = config.dc_pots[0];
  if (!pot) return null;
  const base = {
    id: nextPensionAccessEventId(events),
    pot_ref: pot.name,
    event_type: eventType,
    timing: { kind: 'retirement_date' as const },
    destination: { kind: 'outside_plan' as const },
  };
  if (eventType === 'taxable_flexi_access_drawdown') {
    return { ...base, amount: { kind: 'fixed_amount', value: 10000 } };
  }
  if (eventType === 'crystallise_and_take_pcls') {
    return { ...base, amount: { kind: 'percentage_of_pot', value: 0.25 } };
  }
  return { ...base, amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 } };
}

export function appendDefaultPensionAccessEvent(
  config: PlannerConfig,
  eventType: Extract<PensionAccessEventType, 'tax_free_cash' | 'crystallise_and_take_pcls' | 'taxable_flexi_access_drawdown'> = 'tax_free_cash',
): PlannerConfig {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  const nextEvent = defaultPensionAccessEventForType(config, events, eventType);
  if (!nextEvent) return config;
  return {
    ...config,
    pension_access_events: [
      ...events,
      nextEvent,
    ],
  };
}

export function updatePensionAccessEventAt(
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

function defaultAmountForEventType(eventType: PensionAccessEventConfig['event_type']): PensionAccessEventConfig['amount'] {
  if (eventType === 'taxable_flexi_access_drawdown') return { kind: 'fixed_amount', value: 10000 };
  if (eventType === 'crystallise_and_take_pcls') return { kind: 'percentage_of_pot', value: 0.25 };
  return { kind: 'percentage_of_estimated_tfc_remaining', value: 1 };
}

function eventTreatmentText(event: PensionAccessEventConfig): string {
  switch (event.event_type) {
    case 'crystallise_and_take_pcls':
      return 'PCLS: crystallises a slice, pays the tax-free lump sum outside the plan, and designates the remainder to crystallised drawdown. MPAA is not triggered by PCLS alone.';
    case 'taxable_flexi_access_drawdown':
      return 'Taxable FAD: withdraws from crystallised drawdown as 100% taxable pension income. No further 25% tax-free element applies, and MPAA is expected to trigger.';
    case 'tax_free_cash':
      return 'Reduces the selected pension pot balance. Does not count as ordinary income, taxable income, or taxable drawdown.';
    case 'ufpls':
      return 'UFPLS is retained in the data model but is not exposed as a primary workflow pending adviser/provider validation.';
    case 'ordinary_drawdown_marker':
    case 'already_taken_marker':
      return 'Marker event for pension-access state; not intended as a primary editable workflow.';
  }
}

export function removePensionAccessEventAt(config: PlannerConfig, eventIndex: number): PlannerConfig {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  const nextEvents = events.filter((_, index) => index !== eventIndex);
  if (nextEvents.length === 0) {
    const { pension_access_events: _events, ...rest } = config;
    return rest;
  }
  return { ...config, pension_access_events: nextEvents };
}

type OrdinaryPensionAccessUiMode = 'compatibility_approximation' | 'explicit_ledger_aware';

function ordinaryPensionAccessMode(mode: DCPotPensionAccessConfig | undefined): OrdinaryPensionAccessUiMode {
  return mode?.category === 'explicit_ledger_aware' ? 'explicit_ledger_aware' : 'compatibility_approximation';
}

export function setOrdinaryPensionAccessMode(
  config: PlannerConfig,
  potRef: string,
  mode: OrdinaryPensionAccessUiMode,
): PlannerConfig {
  return {
    ...config,
    dc_pots: config.dc_pots.map(pot => {
      if (pot.name !== potRef) return pot;
      return {
        ...pot,
        pension_access: mode === 'explicit_ledger_aware'
          ? { category: 'explicit_ledger_aware', route: 'taxable_flexi_access_drawdown', cadence: 'monthly' }
          : { category: 'compatibility_approximation', approximation: 'simplified_pro_rata' },
      };
    }),
  };
}

function OrdinaryWithdrawalTreatmentPanel({ config, updateConfig }: {
  config: PlannerConfig;
  updateConfig: (updater: (config: PlannerConfig) => PlannerConfig) => void;
}) {
  if ((config.dc_pots ?? []).length === 0) return null;
  return (
    <div className="mt-3 rounded border border-emerald-100 bg-white px-3 py-2 text-xs text-emerald-800">
      <p className="font-semibold text-emerald-900">Ordinary staged withdrawal treatment</p>
      <p className="mt-1">
        Choose how each DC pot behaves when it is used by ordinary staged withdrawals. Keep compatibility mode unless a PCLS/crystallisation event has created crystallised drawdown for this pot.
      </p>
      <div className="mt-2 space-y-2">
        {config.dc_pots.map(pot => (
          <Field key={pot.name} label={`${pot.name} ordinary withdrawals`}>
            <select
              value={ordinaryPensionAccessMode(pot.pension_access)}
              onChange={event => {
                const mode = event.target.value as OrdinaryPensionAccessUiMode;
                updateConfig(prev => setOrdinaryPensionAccessMode(deepClone(prev) as PlannerConfig, pot.name, mode));
              }}
              className="input-field text-xs"
            >
              <option value="compatibility_approximation">Compatibility: gradual pro-rata tax-free cash</option>
              <option value="explicit_ledger_aware">Ledger-aware taxable FAD from crystallised drawdown</option>
            </select>
          </Field>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-amber-700">
        Ledger-aware FAD uses crystallised drawdown only: ordinary withdrawals are 100% taxable, trigger MPAA, and will not auto-crystallise or fall back to pro-rata.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

export default function PensionAccessEventsPanel() {
  const { config, updateConfig } = useConfig();
  const pensionAccessEvents = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  const validationMessages = validatePensionAccessEvents(config).map(issue => {
    const eventIndex = pensionAccessEvents.findIndex(event => event.id === issue.event_id);
    return formatPensionAccessValidationMessage(issue, eventIndex >= 0 ? eventIndex : 0);
  });

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-emerald-900">Pension access / tax-free cash events</h2>
          <p className="mt-1 text-xs text-emerald-800">
            Optional pension access events, separate from ordinary staged income withdrawals. These can model tax-free cash capital events, PCLS crystallisation, and taxable flexi-access drawdown from crystallised balance.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={(config.dc_pots ?? []).length === 0}
            onClick={() => updateConfig(prev => appendDefaultPensionAccessEvent(deepClone(prev) as PlannerConfig, 'tax_free_cash'))}
            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add TFC event
          </button>
          <button
            type="button"
            disabled={(config.dc_pots ?? []).length === 0}
            onClick={() => updateConfig(prev => appendDefaultPensionAccessEvent(deepClone(prev) as PlannerConfig, 'crystallise_and_take_pcls'))}
            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add PCLS crystallisation
          </button>
          <button
            type="button"
            disabled={(config.dc_pots ?? []).length === 0}
            onClick={() => updateConfig(prev => appendDefaultPensionAccessEvent(deepClone(prev) as PlannerConfig, 'taxable_flexi_access_drawdown'))}
            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add taxable FAD
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-emerald-700">
        Guarded explicit workflow: PCLS/crystallisation and taxable flexi-access drawdown are available for modelling adviser-reviewed phased drawdown. UFPLS is deliberately not exposed here pending adviser/provider validation.
      </p>
      <p className="mt-1 text-[11px] text-emerald-700">
        Initial simplified model: no LSA/LSDBA/provider/MPAA tracking, and destinations inside the plan are not yet financially modelled. Use adviser review before relying on the treatment.
      </p>
      <OrdinaryWithdrawalTreatmentPanel config={config} updateConfig={updateConfig} />
      {validationMessages.length > 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <p className="font-medium">Pension access setup needs attention:</p>
          <ul className="list-disc pl-4">
            {validationMessages.map(message => <li key={message}>{message}</li>)}
          </ul>
        </div>
      )}
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
                <Field label="Event type">
                  <select
                    value={event.event_type}
                    onChange={e => updateConfig(prev => updatePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex, current => {
                      const eventType = e.target.value as Extract<PensionAccessEventType, 'tax_free_cash' | 'crystallise_and_take_pcls' | 'taxable_flexi_access_drawdown'>;
                      return { ...current, event_type: eventType, amount: defaultAmountForEventType(eventType) };
                    }))}
                    className="input-field text-xs"
                  >
                    <option value="tax_free_cash">Tax-free cash capital event</option>
                    <option value="crystallise_and_take_pcls">Crystallise and take PCLS</option>
                    <option value="taxable_flexi_access_drawdown">Taxable flexi-access drawdown</option>
                  </select>
                </Field>
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
                    <option value="outside_plan">Outside plan / informational</option>
                    <option value="held_as_cash_event">Off-plan cash event</option>
                    <option value="tax_free_account">Tax-free account destination (future modelling)</option>
                    <option value="cash_account">Cash account destination (future modelling)</option>
                  </select>
                </Field>
              </div>
              <div className="mt-2 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                <p className="font-medium">Pension access treatment</p>
                <p>{eventTreatmentText(event)}</p>
                <p>Selected pot context: % options are calculated against the pension pot chosen above. For PCLS events, the amount is the slice crystallised; the PCLS is then calculated from that slice by the projection engine.</p>
                <p><span className="font-medium">Currently modelled as: outside-plan cash, informational only.</span> Released cash is not yet added to a modelled cash, ISA, or other destination account.</p>
                <p>In-plan destination flows are a separate follow-up.</p>
              </div>
              <button
                type="button"
                onClick={() => updateConfig(prev => removePensionAccessEventAt(deepClone(prev) as PlannerConfig, eventIndex))}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
                Remove event
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
