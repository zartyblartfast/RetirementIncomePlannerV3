import type { PensionAccessEventConfig, PensionAccessResolvedEvent, PlannerConfig } from './types';

export type PensionAccessEventValidationCode =
  | 'duplicate_event_id'
  | 'missing_pot_ref'
  | 'invalid_fixed_amount'
  | 'invalid_percentage_amount'
  | 'missing_destination_target';

export interface PensionAccessEventValidationIssue {
  code: PensionAccessEventValidationCode;
  event_id: string;
  pot_ref?: string;
  message: string;
}

export function normalizeConfigPensionAccessEvents(cfg: PlannerConfig): PlannerConfig {
  if (!Array.isArray(cfg.pension_access_events)) {
    const { pension_access_events: _events, ...rest } = cfg;
    return rest;
  }

  return {
    ...cfg,
    pension_access_events: cfg.pension_access_events.map(normalizePensionAccessEvent),
  };
}

function normalizePensionAccessEvent(event: PensionAccessEventConfig): PensionAccessEventConfig {
  return {
    ...event,
    destination: event.destination ?? { kind: 'outside_plan' },
  };
}

export function validatePensionAccessEvents(cfg: PlannerConfig): PensionAccessEventValidationIssue[] {
  const events = Array.isArray(cfg.pension_access_events) ? cfg.pension_access_events : [];
  const issues: PensionAccessEventValidationIssue[] = [];
  const seenIds = new Set<string>();
  const validPotRefs = new Set((cfg.dc_pots ?? []).map(pot => pot.name));

  for (const event of events) {
    if (seenIds.has(event.id)) {
      issues.push({
        code: 'duplicate_event_id',
        event_id: event.id,
        message: `Pension access event ${event.id} uses a duplicate event ID.`,
      });
    } else {
      seenIds.add(event.id);
    }

    if (!validPotRefs.has(event.pot_ref)) {
      issues.push({
        code: 'missing_pot_ref',
        event_id: event.id,
        pot_ref: event.pot_ref,
        message: `Pension access event ${event.id} references ${event.pot_ref}, but that pension pot was not found.`,
      });
    }

    if (event.amount.kind === 'fixed_amount' && (!Number.isFinite(event.amount.value) || event.amount.value <= 0)) {
      issues.push({
        code: 'invalid_fixed_amount',
        event_id: event.id,
        message: `Pension access event ${event.id} must use a positive fixed amount.`,
      });
    }

    if (
      event.amount.kind !== 'fixed_amount'
      && (!Number.isFinite(event.amount.value) || event.amount.value <= 0 || event.amount.value > 1)
    ) {
      issues.push({
        code: 'invalid_percentage_amount',
        event_id: event.id,
        message: `Pension access event ${event.id} must use a percentage between 0% and 100%.`,
      });
    }

    if (
      (event.destination?.kind === 'tax_free_account' || event.destination?.kind === 'cash_account')
      && !event.destination.target_ref
    ) {
      issues.push({
        code: 'missing_destination_target',
        event_id: event.id,
        message: `Pension access event ${event.id} sends cash inside the plan but does not name a destination account.`,
      });
    }
  }

  return issues;
}

function parseYearMonth(value: string): [number, number] {
  const [year, month] = value.split('-').map(Number) as [number, number];
  return [year, month];
}

function toAbsMonth(value: string): number {
  const [year, month] = parseYearMonth(value);
  return year * 12 + (month - 1);
}

function fromAbsMonth(absMonth: number): { projection_year: string; month: number } {
  const year = Math.floor(absMonth / 12);
  const month = (absMonth % 12) + 1;
  return { projection_year: String(year), month };
}

function dateForAge(dateOfBirth: string, age: number): string {
  const [dobYear, dobMonth] = parseYearMonth(dateOfBirth);
  return `${dobYear + age}-${String(dobMonth).padStart(2, '0')}`;
}

function resolveTimingAbsMonth(event: PensionAccessEventConfig, cfg: PlannerConfig): number | null {
  switch (event.timing.kind) {
    case 'date':
      return toAbsMonth(event.timing.date);
    case 'age':
      return toAbsMonth(dateForAge(cfg.personal.date_of_birth, event.timing.age));
    case 'retirement_date':
      return toAbsMonth(cfg.personal.retirement_date);
    case 'plan_start':
      return toAbsMonth(cfg.personal.retirement_date);
    case 'first_drawdown_from_pot':
      return null;
  }
}

function resolveFoundationGrossAmount(event: PensionAccessEventConfig, cfg: PlannerConfig): number {
  const pot = cfg.dc_pots.find(candidate => candidate.name === event.pot_ref);
  switch (event.amount.kind) {
    case 'fixed_amount':
      return event.amount.value;
    case 'percentage_of_pot':
      return (pot?.starting_balance ?? 0) * event.amount.value;
    case 'percentage_of_estimated_tfc_remaining':
      return (pot?.starting_balance ?? 0) * (pot?.tax_free_portion ?? 0) * event.amount.value;
  }
}

export function resolvePensionAccessEvents(cfg: PlannerConfig): PensionAccessResolvedEvent[] {
  const events = Array.isArray(cfg.pension_access_events) ? cfg.pension_access_events : [];
  const sortable = events
    .map((event, index) => ({ event: normalizePensionAccessEvent(event), index, absMonth: resolveTimingAbsMonth(event, cfg) }))
    .filter((item): item is { event: PensionAccessEventConfig; index: number; absMonth: number } => item.absMonth !== null)
    .sort((a, b) => a.absMonth - b.absMonth || a.index - b.index);

  const orderByMonth = new Map<number, number>();
  return sortable.map(({ event, absMonth }) => {
    const order = orderByMonth.get(absMonth) ?? 0;
    orderByMonth.set(absMonth, order + 1);
    const pot = cfg.dc_pots.find(candidate => candidate.name === event.pot_ref);
    const resolvedDate = fromAbsMonth(absMonth);
    return {
      id: event.id,
      pot_ref: event.pot_ref,
      pot_name: pot?.name ?? event.pot_ref,
      projection_year: resolvedDate.projection_year,
      month: resolvedDate.month,
      order_in_month: order,
      event_type: event.event_type,
      gross_amount: resolveFoundationGrossAmount(event, cfg),
      tax_free_amount: 0,
      taxable_amount: 0,
      pot_balance_before: 0,
      pot_balance_after: 0,
      estimated_tfc_used: 0,
      estimated_tfc_remaining: 0,
      caveats: ['foundation_only_not_applied'],
    };
  });
}
