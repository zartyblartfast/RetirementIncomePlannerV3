import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, afterEach } from 'vitest';
import type { PlannerConfig } from '../../../engine/types';
import { ConfigContext, DEFAULT_CONFIG, type ConfigContextValue } from '../../../store/configStore';
import DrawdownStagesPanel from '../drawdownStageSummary';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function renderEditor(initialConfig: PlannerConfig = deepClone(DEFAULT_CONFIG)) {
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
      <MemoryRouter>
        <ConfigContext.Provider value={contextValue}>
          <DrawdownStagesPanel variant="editor" />
        </ConfigContext.Provider>
      </MemoryRouter>,
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
      const search = label === 'Delete stage' ? buttons.reverse() : buttons;
      const button = search.find(el => el.textContent?.trim() === label);
      if (!button) throw new Error(`Button not found: ${label}`);
      act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    chooseSelect(label: string, value: string) {
      const select = Array.from(container.querySelectorAll('select')).find(el => el.getAttribute('aria-label') === label);
      if (!select) throw new Error(`Select not found: ${label}`);
      act(() => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
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

let mounted: ReturnType<typeof renderEditor> | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe('DrawdownStagesPanel editor', () => {
  it('adds and deletes stages with visible validation for an empty new stage', () => {
    mounted = renderEditor();

    mounted.clickButton('Add stage');

    expect(mounted.config.drawdown_stages?.map(stage => stage.id)).toEqual([
      'stage_1',
      'stage_2',
    ]);
    expect(mounted.container.textContent).toContain('Stage 2 needs at least one source before it can be used in projections.');
    expect(mounted.container.textContent).toContain('How staged drawdown is used');

    mounted.clickButton('Delete stage');

    expect(mounted.config.drawdown_stages?.map(stage => stage.id)).toEqual([
      'stage_1',
    ]);
  });

  it('adds a source to an existing stage and removes it without using stale withdrawal priority', () => {
    mounted = renderEditor({
      ...deepClone(DEFAULT_CONFIG),
      withdrawal_priority: ['DC Pension', 'ISA'],
      drawdown_stages: [
        {
          id: 'legacy_stage_1',
          sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
        },
        {
          id: 'legacy_stage_2',
          sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
        },
      ],
    });

    mounted.chooseSelect('Add source to Stage 1', 'tax_free_account:ISA');

    expect(mounted.config.drawdown_stages?.[0]?.sources).toEqual([
      { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.5 },
      { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.5 },
    ]);
    expect(mounted.config.drawdown_stages?.map(stage => stage.id)).toEqual(['legacy_stage_1']);
    expect(mounted.config.withdrawal_priority).toEqual(['DC Pension', 'ISA']);
    expect(mounted.container.textContent).toContain('ISA');

    mounted.clickButton('Remove ISA from Stage 1');

    expect(mounted.config.drawdown_stages?.[0]?.sources).toEqual([
      { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 },
    ]);
    expect(mounted.config.withdrawal_priority).toEqual(['DC Pension']);
  });

  it('leaves pension access event editing to the separate Strategy panel', () => {
    mounted = renderEditor();

    expect(mounted.container.textContent).not.toContain('Pension access / tax-free cash events');
    expect(mounted.container.textContent).not.toContain('Add TFC event');
  });
});
