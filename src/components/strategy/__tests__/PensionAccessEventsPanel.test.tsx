import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach } from 'vitest';
import type { PlannerConfig } from '../../../engine/types';
import { ConfigContext, DEFAULT_CONFIG, type ConfigContextValue } from '../../../store/configStore';
import PensionAccessEventsPanel, {
  appendDefaultPensionAccessEvent,
  formatPensionAccessEventSummary,
  formatPensionAccessValidationMessage,
  removePensionAccessEventAt,
} from '../PensionAccessEventsPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function renderPanel(initialConfig: PlannerConfig = deepClone(DEFAULT_CONFIG)) {
  let currentConfig = initialConfig;
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;

  function renderWithConfig(config: PlannerConfig) {
    currentConfig = config;
    const contextValue: ConfigContextValue = {
      config,
      setConfig: (next) => renderWithConfig(next),
      updateConfig: (updater) => renderWithConfig(updater(currentConfig)),
      resetToDefault: () => renderWithConfig(deepClone(DEFAULT_CONFIG)),
      isFirstVisit: false,
      markConfigured: () => undefined,
    };

    root.render(
      <ConfigContext.Provider value={contextValue}>
        <PensionAccessEventsPanel />
      </ConfigContext.Provider>,
    );
  }

  act(() => {
    root = createRoot(container);
    renderWithConfig(initialConfig);
  });

  return {
    container,
    get config() {
      return currentConfig;
    },
    clickButton(label: string) {
      const buttons = Array.from(container.querySelectorAll('button'));
      const button = buttons.find(el => el.textContent?.trim() === label);
      if (!button) throw new Error(`Button not found: ${label}`);
      act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    chooseFirstSelectByValue(currentValue: string, nextValue: string) {
      const select = Array.from(container.querySelectorAll('select')).find(el => el.value === currentValue);
      if (!select) throw new Error(`Select with value not found: ${currentValue}`);
      act(() => {
        select.value = nextValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
    changeFirstInputValue(currentValue: string, nextValue: string) {
      const input = Array.from(container.querySelectorAll('input')).find(el => el.value === currentValue);
      if (!input) throw new Error(`Input with value not found: ${currentValue}`);
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      act(() => {
        valueSetter?.call(input, nextValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted: ReturnType<typeof renderPanel> | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe('PensionAccessEventsPanel', () => {
  it('formats pension access event summaries as separate selected-pot capital events', () => {
    expect(formatPensionAccessEventSummary({
      id: 'event_1',
      pot_ref: 'DC Pension',
      event_type: 'tax_free_cash',
      timing: { kind: 'retirement_date' },
      amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
      destination: { kind: 'outside_plan' },
    }, 0)).toBe('Event 1: DC Pension — tax-free cash at the plan retirement date, 100.0% of estimated remaining tax-free cash from this pot paid outside the plan');

    expect(formatPensionAccessEventSummary({
      id: 'event_2',
      pot_ref: 'SIPP 2',
      event_type: 'tax_free_cash',
      timing: { kind: 'retirement_date' },
      amount: { kind: 'percentage_of_pot', value: 0.25 },
      destination: { kind: 'outside_plan' },
    }, 1)).toBe('Event 2: SIPP 2 — tax-free cash at the plan retirement date, 25.0% of selected pot value at the event date paid outside the plan');
  });

  it('formats validation issues with user-facing event numbers and selected-pot context', () => {
    expect(formatPensionAccessValidationMessage({
      code: 'missing_pot_ref',
      event_id: 'bad_event',
      pot_ref: 'Missing pension',
      message: 'Pension access event bad_event references Missing pension, but that pension pot was not found.',
    }, 0)).toBe('Event 1: selected pension pot “Missing pension” was not found. Choose an existing DC pension pot.');

    expect(formatPensionAccessValidationMessage({
      code: 'invalid_percentage_amount',
      event_id: 'too_much',
      message: 'Pension access event too_much must use a percentage between 0% and 100%.',
    }, 1)).toBe('Event 2: percentage must be more than 0% and no more than 100% of the selected pot/basis.');
  });

  it('adds a default retirement tax-free cash event without changing drawdown stages', () => {
    const next = appendDefaultPensionAccessEvent(deepClone(DEFAULT_CONFIG));

    expect(next.pension_access_events).toEqual([
      {
        id: 'pension_access_event_1',
        pot_ref: 'DC Pension',
        event_type: 'tax_free_cash',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
        destination: { kind: 'outside_plan' },
      },
    ]);
    expect(next.drawdown_stages).toEqual(DEFAULT_CONFIG.drawdown_stages);
  });

  it('removes the last event by stripping pension_access_events back to undefined', () => {
    const withEvent = appendDefaultPensionAccessEvent(deepClone(DEFAULT_CONFIG));

    expect(removePensionAccessEventAt(withEvent, 0).pension_access_events).toBeUndefined();
  });

  it('adds and edits an initial tax-free cash event from the UI', () => {
    mounted = renderPanel();

    mounted.clickButton('Add TFC event');

    expect(mounted.config.pension_access_events).toEqual([
      {
        id: 'pension_access_event_1',
        pot_ref: 'DC Pension',
        event_type: 'tax_free_cash',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
        destination: { kind: 'outside_plan' },
      },
    ]);
    expect(mounted.config.drawdown_stages).toEqual(DEFAULT_CONFIG.drawdown_stages);
    expect(mounted.container.textContent).toContain('Optional one-off capital events, separate from ordinary staged income withdrawals.');
    expect(mounted.container.textContent).toContain('Event 1: DC Pension — tax-free cash at the plan retirement date, 100.0% of estimated remaining tax-free cash from this pot paid outside the plan');
    expect(mounted.container.textContent).toContain('Reduces the selected pension pot balance. Does not count as ordinary income, taxable income, or taxable drawdown.');
    expect(mounted.container.textContent).toContain('Currently modelled as: outside-plan cash, informational only.');
    expect(mounted.container.textContent).not.toContain('when this pot first enters ordinary drawdown');

    const destinationSelect = Array.from(mounted.container.querySelectorAll('select'))
      .find(select => select.value === 'outside_plan');
    expect(destinationSelect?.disabled).toBe(true);

    mounted.chooseFirstSelectByValue('percentage_of_estimated_tfc_remaining', 'fixed_amount');
    mounted.changeFirstInputValue('10000', '25000');

    expect(mounted.config.pension_access_events?.[0]?.amount).toEqual({ kind: 'fixed_amount', value: 25000 });
    expect(mounted.container.textContent).toContain('£25,000 paid outside the plan');
  });

  it('surfaces pension access validation messages and removes the last event cleanly', () => {
    mounted = renderPanel({
      ...deepClone(DEFAULT_CONFIG),
      pension_access_events: [
        {
          id: 'bad_event',
          pot_ref: 'Missing pension',
          event_type: 'tax_free_cash',
          timing: { kind: 'retirement_date' },
          amount: { kind: 'fixed_amount', value: 0 },
          destination: { kind: 'outside_plan' },
        },
      ],
    });

    expect(mounted.container.textContent).toContain('Event 1: selected pension pot “Missing pension” was not found. Choose an existing DC pension pot.');
    expect(mounted.container.textContent).toContain('Event 1: fixed amount must be more than £0.');

    mounted.clickButton('Remove TFC event');

    expect(mounted.config.pension_access_events).toBeUndefined();
  });
});
