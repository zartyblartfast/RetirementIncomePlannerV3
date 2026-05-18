import type { PensionAccessEventAmount, PensionAccessEventConfig, PlannerConfig } from '../../engine/types';

export type PensionAccessScenarioMode = 'none' | 'retirement_tfc';

export function pensionAccessScenarioMode(config: PlannerConfig): PensionAccessScenarioMode {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  return events.some(event => event.event_type === 'tax_free_cash') ? 'retirement_tfc' : 'none';
}

export function defaultRetirementTfcEvent(config: PlannerConfig): PensionAccessEventConfig | null {
  const pot = config.dc_pots[0];
  if (!pot) return null;
  return {
    id: 'sandbox_retirement_tfc',
    pot_ref: pot.name,
    event_type: 'tax_free_cash',
    timing: { kind: 'retirement_date' },
    amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
    destination: { kind: 'outside_plan' },
  };
}

export function setRetirementTfcScenario(config: PlannerConfig, enabled: boolean): PlannerConfig {
  const existing = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  const withoutSandboxEvent = existing.filter(event => event.id !== 'sandbox_retirement_tfc');

  if (!enabled) {
    if (withoutSandboxEvent.length === 0) {
      const { pension_access_events: _events, ...rest } = config;
      return rest;
    }
    return { ...config, pension_access_events: withoutSandboxEvent };
  }

  const event = defaultRetirementTfcEvent(config);
  if (!event) return config;
  return { ...config, pension_access_events: [...withoutSandboxEvent, event] };
}

export function updateSandboxTfcAmount(config: PlannerConfig, amount: PensionAccessEventAmount): PlannerConfig {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  if (!events.some(event => event.id === 'sandbox_retirement_tfc')) return config;
  return {
    ...config,
    pension_access_events: events.map(event => event.id === 'sandbox_retirement_tfc' ? { ...event, amount } : event),
  };
}

export function updateSandboxTfcPot(config: PlannerConfig, potRef: string): PlannerConfig {
  const events = Array.isArray(config.pension_access_events) ? config.pension_access_events : [];
  if (!events.some(event => event.id === 'sandbox_retirement_tfc')) return config;
  return {
    ...config,
    pension_access_events: events.map(event => event.id === 'sandbox_retirement_tfc' ? { ...event, pot_ref: potRef } : event),
  };
}

export function formatSandboxTfcAmount(amount: PensionAccessEventAmount): string {
  switch (amount.kind) {
    case 'fixed_amount': return `£${Math.round(amount.value).toLocaleString('en-GB')}`;
    case 'percentage_of_pot': return `${(amount.value * 100).toFixed(1)}% of pot`;
    case 'percentage_of_estimated_tfc_remaining': return `${(amount.value * 100).toFixed(1)}% of estimated remaining TFC`;
  }
}
