import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../store/configStore';
import type { PlannerConfig } from '../../../engine/types';
import {
  defaultRetirementTfcEvent,
  formatSandboxTfcAmount,
  pensionAccessScenarioMode,
  setRetirementTfcScenario,
  updateSandboxTfcAmount,
  updateSandboxTfcPot,
} from '../pensionAccessSandbox';

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

describe('pension access sandbox helpers', () => {
  it('creates a retirement-date TFC scenario event without changing drawdown stages', () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    const withEvent = setRetirementTfcScenario(cfg, true);

    expect(defaultRetirementTfcEvent(cfg)).toEqual({
      id: 'sandbox_retirement_tfc',
      pot_ref: 'DC Pension',
      event_type: 'tax_free_cash',
      timing: { kind: 'retirement_date' },
      amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
      destination: { kind: 'outside_plan' },
    });
    expect(pensionAccessScenarioMode(withEvent)).toBe('retirement_tfc');
    expect(withEvent.pension_access_events).toEqual([defaultRetirementTfcEvent(cfg)]);
    expect(withEvent.drawdown_stages).toEqual(DEFAULT_CONFIG.drawdown_stages);
    expect(cfg.pension_access_events).toBeUndefined();
  });

  it('updates only the sandbox TFC event and preserves other configured access events', () => {
    const cfg = setRetirementTfcScenario(cloneConfig(DEFAULT_CONFIG), true);
    cfg.pension_access_events!.push({
      id: 'adviser_authored_event',
      pot_ref: 'DC Pension',
      event_type: 'tax_free_cash',
      timing: { kind: 'age', age: 70 },
      amount: { kind: 'fixed_amount', value: 5000 },
      destination: { kind: 'outside_plan' },
    });

    const updated = updateSandboxTfcAmount(cfg, { kind: 'fixed_amount', value: 25000 });

    expect(updated.pension_access_events).toEqual([
      expect.objectContaining({ id: 'sandbox_retirement_tfc', amount: { kind: 'fixed_amount', value: 25000 } }),
      expect.objectContaining({ id: 'adviser_authored_event', amount: { kind: 'fixed_amount', value: 5000 } }),
    ]);
    expect(formatSandboxTfcAmount(updated.pension_access_events![0]!.amount)).toBe('£25,000');
  });

  it('updates the selected pension pot for only the sandbox TFC event', () => {
    const cfg = setRetirementTfcScenario({
      ...cloneConfig(DEFAULT_CONFIG),
      dc_pots: [
        DEFAULT_CONFIG.dc_pots[0]!,
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'SIPP 2', starting_balance: 120000 },
      ],
    }, true);
    cfg.pension_access_events!.push({
      id: 'adviser_authored_event',
      pot_ref: 'DC Pension',
      event_type: 'tax_free_cash',
      timing: { kind: 'age', age: 70 },
      amount: { kind: 'fixed_amount', value: 5000 },
      destination: { kind: 'outside_plan' },
    });

    const updated = updateSandboxTfcPot(cfg, 'SIPP 2');

    expect(updated.pension_access_events).toEqual([
      expect.objectContaining({ id: 'sandbox_retirement_tfc', pot_ref: 'SIPP 2' }),
      expect.objectContaining({ id: 'adviser_authored_event', pot_ref: 'DC Pension' }),
    ]);
  });

  it('removes only the sandbox TFC event and drops the property when none remain', () => {
    const withOnlySandboxEvent = setRetirementTfcScenario(cloneConfig(DEFAULT_CONFIG), true);
    expect(setRetirementTfcScenario(withOnlySandboxEvent, false).pension_access_events).toBeUndefined();

    const withOtherEvent = setRetirementTfcScenario(cloneConfig(DEFAULT_CONFIG), true);
    withOtherEvent.pension_access_events!.push({
      id: 'adviser_authored_event',
      pot_ref: 'DC Pension',
      event_type: 'tax_free_cash',
      timing: { kind: 'age', age: 70 },
      amount: { kind: 'fixed_amount', value: 5000 },
      destination: { kind: 'outside_plan' },
    });

    const withoutSandboxEvent = setRetirementTfcScenario(withOtherEvent, false);

    expect(withoutSandboxEvent.pension_access_events).toEqual([
      expect.objectContaining({ id: 'adviser_authored_event' }),
    ]);
  });
});
