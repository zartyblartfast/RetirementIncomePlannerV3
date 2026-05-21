import type { PensionLedgerPlanSummary, PensionLedgerState, PensionLedgerWarning } from './types';

export type PensionLedgerResolutionOutcome = 'applied' | 'insufficient_balance' | 'zero_amount_skipped';

export type PensionLedgerResolutionEvent =
  | {
      id: string;
      event_type: 'ufpls';
      date: string;
      gross_amount: number;
      tax_free_fraction?: number;
    }
  | {
      id: string;
      event_type: 'crystallise_and_take_pcls';
      date: string;
      crystallise_amount: number;
      tax_free_cash_amount?: number;
    }
  | {
      id: string;
      event_type: 'taxable_flexi_access_drawdown';
      date: string;
      gross_amount: number;
    };

export interface PensionLedgerAppliedEvent {
  id: string;
  event_type: PensionLedgerResolutionEvent['event_type'];
  outcome: PensionLedgerResolutionOutcome;
  gross_amount: number;
  tax_free_amount: number;
  taxable_amount: number;
  lsa_used_delta: number;
  warnings: PensionLedgerWarning[];
}

export interface PensionLedgerResolutionResult extends PensionLedgerAppliedEvent {
  ledger: PensionLedgerState;
  applied_events: PensionLedgerAppliedEvent[];
}

const DEFAULT_UFPLS_TAX_FREE_FRACTION = 0.25;
const DEFAULT_PCLS_FRACTION = 0.25;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function appendWarnings(
  existing: PensionLedgerWarning[],
  additions: PensionLedgerWarning[],
): PensionLedgerWarning[] {
  const result = [...existing];
  for (const warning of additions) {
    if (!result.includes(warning)) {
      result.push(warning);
    }
  }
  return result;
}

function amountForEvent(event: PensionLedgerResolutionEvent): number {
  switch (event.event_type) {
    case 'ufpls':
    case 'taxable_flexi_access_drawdown':
      return event.gross_amount;
    case 'crystallise_and_take_pcls':
      return event.crystallise_amount;
  }
}

function eventPriority(event: PensionLedgerResolutionEvent): number {
  switch (event.event_type) {
    case 'crystallise_and_take_pcls':
      return 0;
    case 'ufpls':
      return 1;
    case 'taxable_flexi_access_drawdown':
      return 2;
  }
}

function sortEvents(events: PensionLedgerResolutionEvent[]): PensionLedgerResolutionEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || eventPriority(a.event) - eventPriority(b.event) || a.index - b.index)
    .map(({ event }) => event);
}

function emptyResult(
  ledger: PensionLedgerState,
  event: PensionLedgerResolutionEvent,
  outcome: PensionLedgerResolutionOutcome,
  warnings: PensionLedgerWarning[],
): PensionLedgerResolutionResult {
  const appliedEvent: PensionLedgerAppliedEvent = {
    id: event.id,
    event_type: event.event_type,
    outcome,
    gross_amount: 0,
    tax_free_amount: 0,
    taxable_amount: 0,
    lsa_used_delta: 0,
    warnings,
  };
  return {
    ...appliedEvent,
    ledger: { ...ledger, warnings: appendWarnings(ledger.warnings, warnings) },
    applied_events: [appliedEvent],
  };
}

function applyLsaCap(
  ledger: PensionLedgerState,
  requestedTaxFree: number,
  reductionWarning: PensionLedgerWarning,
): { taxFreeAmount: number; lsaUsedDelta: number; lsaUsed?: number; lsaRemaining?: number; warnings: PensionLedgerWarning[] } {
  if (ledger.lsa_tracking_status !== 'tracked') {
    return {
      taxFreeAmount: requestedTaxFree,
      lsaUsedDelta: 0,
      lsaUsed: ledger.lsa_used,
      lsaRemaining: ledger.lsa_remaining,
      warnings: ledger.lsa_tracking_status === 'warning_only' ? ['lsa_warning_only'] : ['lsa_not_modelled'],
    };
  }

  const currentUsed = ledger.lsa_used ?? 0;
  const currentRemaining = ledger.lsa_remaining ?? 0;
  const taxFreeAmount = roundMoney(Math.min(requestedTaxFree, currentRemaining));
  const warnings: PensionLedgerWarning[] = taxFreeAmount < requestedTaxFree ? [reductionWarning] : [];
  return {
    taxFreeAmount,
    lsaUsedDelta: taxFreeAmount,
    lsaUsed: roundMoney(currentUsed + taxFreeAmount),
    lsaRemaining: roundMoney(Math.max(0, currentRemaining - taxFreeAmount)),
    warnings,
  };
}

function maybeTriggerMpaa(
  ledger: PensionLedgerState,
  date: string,
  triggerWarning: PensionLedgerWarning,
): Pick<PensionLedgerState, 'mpaa_triggered' | 'mpaa_trigger_date'> & { warnings: PensionLedgerWarning[] } {
  if (ledger.mpaa_triggered) {
    return { mpaa_triggered: true, mpaa_trigger_date: ledger.mpaa_trigger_date, warnings: [] };
  }

  return { mpaa_triggered: true, mpaa_trigger_date: date, warnings: [triggerWarning] };
}

function applyUfpls(ledger: PensionLedgerState, event: Extract<PensionLedgerResolutionEvent, { event_type: 'ufpls' }>): PensionLedgerResolutionResult {
  const grossAmount = roundMoney(event.gross_amount);
  if (grossAmount <= 0) {
    return emptyResult(ledger, event, 'zero_amount_skipped', []);
  }
  if (grossAmount > ledger.uncrystallised_balance) {
    return emptyResult(ledger, event, 'insufficient_balance', ['uncrystallised_balance_insufficient_for_access']);
  }

  const requestedTaxFree = roundMoney(grossAmount * (event.tax_free_fraction ?? DEFAULT_UFPLS_TAX_FREE_FRACTION));
  const lsa = applyLsaCap(ledger, requestedTaxFree, 'lsa_exceeded_ufpls_tax_free_reduced');
  const taxableAmount = roundMoney(grossAmount - lsa.taxFreeAmount);
  const mpaa = maybeTriggerMpaa(ledger, event.date, 'mpaa_triggered_by_ufpls');
  const warnings = appendWarnings(
    ['ufpls_tax_free_fraction_assumed_25pct'],
    [...lsa.warnings, ...mpaa.warnings],
  );

  const nextLedger: PensionLedgerState = {
    ...ledger,
    uncrystallised_balance: roundMoney(ledger.uncrystallised_balance - grossAmount),
    tax_free_cash_taken: roundMoney(ledger.tax_free_cash_taken + lsa.taxFreeAmount),
    taxable_drawdown_taken: roundMoney(ledger.taxable_drawdown_taken + taxableAmount),
    lsa_used: lsa.lsaUsed,
    lsa_remaining: lsa.lsaRemaining,
    mpaa_triggered: mpaa.mpaa_triggered,
    mpaa_trigger_date: mpaa.mpaa_trigger_date,
    warnings: appendWarnings(ledger.warnings, warnings),
  };

  const appliedEvent: PensionLedgerAppliedEvent = {
    id: event.id,
    event_type: event.event_type,
    outcome: 'applied',
    gross_amount: grossAmount,
    tax_free_amount: lsa.taxFreeAmount,
    taxable_amount: taxableAmount,
    lsa_used_delta: lsa.lsaUsedDelta,
    warnings,
  };

  return { ...appliedEvent, ledger: nextLedger, applied_events: [appliedEvent] };
}

function applyCrystalliseAndTakePcls(
  ledger: PensionLedgerState,
  event: Extract<PensionLedgerResolutionEvent, { event_type: 'crystallise_and_take_pcls' }>,
): PensionLedgerResolutionResult {
  const crystalliseAmount = roundMoney(event.crystallise_amount);
  if (crystalliseAmount <= 0) {
    return emptyResult(ledger, event, 'zero_amount_skipped', []);
  }
  if (crystalliseAmount > ledger.uncrystallised_balance) {
    return emptyResult(ledger, event, 'insufficient_balance', ['uncrystallised_balance_insufficient_for_access']);
  }

  const maxPcls = roundMoney(crystalliseAmount * DEFAULT_PCLS_FRACTION);
  const requestedPcls = roundMoney(event.tax_free_cash_amount ?? maxPcls);
  const cappedPcls = roundMoney(Math.min(requestedPcls, maxPcls));
  const capWarnings: PensionLedgerWarning[] = requestedPcls > maxPcls ? ['pcls_capped_at_25pct_of_crystallised'] : [];
  const lsa = applyLsaCap(ledger, cappedPcls, 'lsa_exceeded_ufpls_tax_free_reduced');
  const pclsLsaWarnings: PensionLedgerWarning[] = ledger.lsa_tracking_status === 'tracked'
    ? lsa.warnings
    : ['pcls_above_lsa_headroom_not_modelled'];
  const warnings = appendWarnings([...capWarnings, 'mpaa_not_triggered_pcls_only'], pclsLsaWarnings);
  const drawdownDesignation = roundMoney(crystalliseAmount - lsa.taxFreeAmount);

  const nextLedger: PensionLedgerState = {
    ...ledger,
    uncrystallised_balance: roundMoney(ledger.uncrystallised_balance - crystalliseAmount),
    crystallised_drawdown_balance: roundMoney(ledger.crystallised_drawdown_balance + drawdownDesignation),
    tax_free_cash_taken: roundMoney(ledger.tax_free_cash_taken + lsa.taxFreeAmount),
    lsa_used: lsa.lsaUsed,
    lsa_remaining: lsa.lsaRemaining,
    warnings: appendWarnings(ledger.warnings, warnings),
  };

  const appliedEvent: PensionLedgerAppliedEvent = {
    id: event.id,
    event_type: event.event_type,
    outcome: 'applied',
    gross_amount: crystalliseAmount,
    tax_free_amount: lsa.taxFreeAmount,
    taxable_amount: 0,
    lsa_used_delta: lsa.lsaUsedDelta,
    warnings,
  };

  return { ...appliedEvent, ledger: nextLedger, applied_events: [appliedEvent] };
}

function applyTaxableFlexiAccessDrawdown(
  ledger: PensionLedgerState,
  event: Extract<PensionLedgerResolutionEvent, { event_type: 'taxable_flexi_access_drawdown' }>,
): PensionLedgerResolutionResult {
  const grossAmount = roundMoney(event.gross_amount);
  if (grossAmount <= 0) {
    return emptyResult(ledger, event, 'zero_amount_skipped', []);
  }
  if (grossAmount > ledger.crystallised_drawdown_balance) {
    return emptyResult(ledger, event, 'insufficient_balance', ['crystallised_balance_insufficient_for_drawdown']);
  }

  const mpaa = maybeTriggerMpaa(ledger, event.date, 'mpaa_triggered_by_taxable_drawdown');
  const warnings = mpaa.warnings;
  const nextLedger: PensionLedgerState = {
    ...ledger,
    crystallised_drawdown_balance: roundMoney(ledger.crystallised_drawdown_balance - grossAmount),
    taxable_drawdown_taken: roundMoney(ledger.taxable_drawdown_taken + grossAmount),
    mpaa_triggered: mpaa.mpaa_triggered,
    mpaa_trigger_date: mpaa.mpaa_trigger_date,
    warnings: appendWarnings(ledger.warnings, warnings),
  };

  const appliedEvent: PensionLedgerAppliedEvent = {
    id: event.id,
    event_type: event.event_type,
    outcome: 'applied',
    gross_amount: grossAmount,
    tax_free_amount: 0,
    taxable_amount: grossAmount,
    lsa_used_delta: 0,
    warnings,
  };

  return { ...appliedEvent, ledger: nextLedger, applied_events: [appliedEvent] };
}

function applySinglePensionLedgerEvent(
  ledger: PensionLedgerState,
  event: PensionLedgerResolutionEvent,
): PensionLedgerResolutionResult {
  switch (event.event_type) {
    case 'ufpls':
      return applyUfpls(ledger, event);
    case 'crystallise_and_take_pcls':
      return applyCrystalliseAndTakePcls(ledger, event);
    case 'taxable_flexi_access_drawdown':
      return applyTaxableFlexiAccessDrawdown(ledger, event);
  }
}

export function applyPensionLedgerEvent(
  ledger: PensionLedgerState,
  eventOrEvents: PensionLedgerResolutionEvent | PensionLedgerResolutionEvent[],
): PensionLedgerResolutionResult {
  const events = Array.isArray(eventOrEvents) ? sortEvents(eventOrEvents) : [eventOrEvents];
  let currentLedger: PensionLedgerState = { ...ledger, warnings: [...ledger.warnings] };
  const appliedEvents: PensionLedgerAppliedEvent[] = [];
  let lastResult: PensionLedgerResolutionResult | null = null;

  for (const event of events) {
    if (amountForEvent(event) <= 0) {
      const result = emptyResult(currentLedger, event, 'zero_amount_skipped', []);
      currentLedger = result.ledger;
      appliedEvents.push(result.applied_events[0]!);
      lastResult = result;
      continue;
    }
    const result = applySinglePensionLedgerEvent(currentLedger, event);
    currentLedger = result.ledger;
    appliedEvents.push(result.applied_events[0]!);
    lastResult = result;
  }

  const finalEvent = appliedEvents[appliedEvents.length - 1];
  if (!lastResult || !finalEvent) {
    throw new Error('applyPensionLedgerEvent requires at least one event.');
  }

  return {
    ...finalEvent,
    ledger: currentLedger,
    applied_events: appliedEvents,
  };
}

export function summarizePensionLedgerStates(ledgers: PensionLedgerState[]): PensionLedgerPlanSummary {
  const allTracked = ledgers.length > 0 && ledgers.every(ledger => ledger.lsa_tracking_status === 'tracked');
  const anyWarningOnly = ledgers.some(ledger => ledger.lsa_tracking_status === 'warning_only');
  const inferredLsaAllowances = ledgers
    .filter(ledger => ledger.lsa_tracking_status === 'tracked')
    .map(ledger => (ledger.lsa_used ?? 0) + (ledger.lsa_remaining ?? 0));
  const inferredPlanLsa = inferredLsaAllowances.length > 0 ? Math.max(...inferredLsaAllowances) : undefined;
  const lsaUsedTotal = allTracked ? roundMoney(ledgers.reduce((sum, ledger) => sum + (ledger.lsa_used ?? 0), 0)) : undefined;
  const lsaRemainingTotal = allTracked && inferredPlanLsa !== undefined
    ? roundMoney(Math.max(0, inferredPlanLsa - (lsaUsedTotal ?? 0)))
    : undefined;
  const mpaaDates = ledgers
    .filter(ledger => ledger.mpaa_triggered && ledger.mpaa_trigger_date)
    .map(ledger => ledger.mpaa_trigger_date!)
    .sort();

  return {
    lsa_used_total: lsaUsedTotal,
    lsa_remaining_total: lsaRemainingTotal,
    lsa_tracking_status: allTracked ? 'tracked' : anyWarningOnly ? 'warning_only' : 'not_modelled',
    mpaa_triggered: ledgers.some(ledger => ledger.mpaa_triggered),
    mpaa_trigger_date: mpaaDates[0],
  };
}
