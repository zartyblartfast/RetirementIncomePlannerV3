import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlannerConfig } from '../../engine/types';
import Optimise from '../Optimise';
import { ConfigContext, DEFAULT_CONFIG, type ConfigContextValue } from '../../store/configStore';
import { loadScenarios } from '../../store/scenarioStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeStrategyConfig(): PlannerConfig {
  const cfg = deepClone(DEFAULT_CONFIG);
  cfg.dc_pots = [
    { ...cfg.dc_pots[0]!, name: 'Main DC', starting_balance: 120000 },
    { ...cfg.dc_pots[0]!, name: 'Second DC', starting_balance: 80000 },
  ];
  cfg.tax_free_accounts = [
    { ...cfg.tax_free_accounts[0]!, name: 'ISA', starting_balance: 40000 },
  ];
  cfg.withdrawal_priority = ['Main DC', 'Second DC', 'ISA'];
  cfg.drawdown_stages = [
    {
      id: 'current_blend',
      name: 'Opening blend',
      sources: [
        { source_type: 'dc_pot', source_name: 'Main DC', target_share: 0.6 },
        { source_type: 'dc_pot', source_name: 'Second DC', target_share: 0.4 },
      ],
    },
    {
      id: 'isa_later',
      sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
    },
  ];
  return cfg;
}

function renderOptimise(initialConfig: PlannerConfig = makeStrategyConfig()) {
  let currentConfig = initialConfig;
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;

  function renderWithConfig(config: PlannerConfig) {
    currentConfig = config;
    const contextValue: ConfigContextValue = {
      config,
      setConfig: next => renderWithConfig(next),
      updateConfig: updater => renderWithConfig(updater(currentConfig)),
      resetToDefault: () => renderWithConfig(deepClone(DEFAULT_CONFIG)),
      isFirstVisit: false,
      markConfigured: () => undefined,
    };

    root.render(
      <MemoryRouter>
        <ConfigContext.Provider value={contextValue}>
          <Optimise />
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
    clickText(text: string) {
      const target = Array.from(container.querySelectorAll('tr, button'))
        .find(el => el.textContent?.includes(text));
      if (!target) throw new Error(`Element not found: ${text}`);
      act(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted: ReturnType<typeof renderOptimise> | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Optimise Strategy page', () => {
  it('shows Strategy Impact Comparison candidates including current and blended strategies', () => {
    mounted = renderOptimise();

    expect(mounted.container.textContent).toContain('Strategy Impact Comparison');
    expect(mounted.container.textContent).toContain('Compare common source-order and blending patterns');
    expect(mounted.container.textContent).toContain('Applied income rule: Fixed Target');
    expect(mounted.container.textContent).toContain('Rows below only vary the source order/blending pattern used to fund that income rule');
    expect(mounted.container.textContent).toContain('Income and capital are calculated by running the normal projection engine for each source pattern');
    expect(mounted.container.textContent).toContain('Showing representative source patterns, not every possible sequencing or blend-percentage permutation');
    expect(mounted.container.textContent).toContain('Save a selected row as a What If scenario to compare or edit it later without changing the Current Plan');
    expect(mounted.container.textContent).toContain('Reference income is the Current Plan planning benchmark');
    expect(mounted.container.textContent).toContain('portfolio-driven strategies such as ARVA are compared against it for adequacy');
    expect(mounted.container.textContent).toContain('Rank by goal:');
    expect(mounted.container.textContent).toContain('Balanced');
    expect(mounted.container.textContent).toContain('Maximise spending');
    expect(mounted.container.textContent).toContain('Preserve capital');
    expect(mounted.container.textContent).toContain('Avoid income gaps');
    expect(mounted.container.textContent).toContain('Smooth income');
    expect(mounted.container.textContent).toContain('Minimise tax');
    expect(mounted.container.textContent).toContain('Current strategy');
    expect(mounted.container.textContent).toContain('Source pattern');
    expect(mounted.container.textContent).toContain('Income rule: Fixed Target');
    expect(mounted.container.textContent).toContain('Source rule: Opening blend — Main DC 60.0% + Second DC 40.0%; Stage 2 — ISA 100.0%');
    expect(mounted.container.textContent).toContain('Blend DC pensions first, then tax-free accounts');
    expect(mounted.container.textContent).toContain('Avg net income');
    expect(mounted.container.textContent).toContain('Min net income');
    expect(mounted.container.textContent).toContain('Years below reference');
    expect(mounted.container.textContent).toContain('Total gap');
    expect(mounted.container.textContent).toContain('Worst gap');
    expect(mounted.container.textContent).toContain('End capital');
    expect(mounted.container.textContent).toContain('Total tax');
    expect(mounted.container.textContent).toContain('Best for selected goal');
    expect(mounted.container.textContent).not.toContain('Shortfall Age');
    expect(mounted.container.textContent).not.toContain('First Depleted Age');
    expect(mounted.container.textContent).not.toContain('Shortfall years');
  });

  it('labels portfolio-driven strategy comparisons as source-pattern comparisons under the active income rule', () => {
    const cfg = makeStrategyConfig();
    cfg.drawdown_strategy = 'arva';
    cfg.drawdown_strategy_params = { assumed_real_return_pct: 3 };

    mounted = renderOptimise(cfg);

    expect(mounted.container.textContent).toContain('Strategy: ARVA');
    expect(mounted.container.textContent).toContain('Applied income rule: ARVA');
    expect(mounted.container.textContent).toContain('Rows below only vary the source order/blending pattern used to fund that income rule');
    expect(mounted.container.textContent).toContain('Income rule: ARVA');
    expect(mounted.container.textContent).toContain('Source rule:');
  });

  it('saves a selected source pattern as a What If scenario without changing the Current Plan', () => {
    mounted = renderOptimise();
    const initialStages = deepClone(mounted.config.drawdown_stages);
    const initialPriority = deepClone(mounted.config.withdrawal_priority);
    vi.spyOn(window, 'prompt').mockReturnValue('Fixed Target - Blend DC first test');

    mounted.clickText('Blend DC pensions first, then tax-free accounts');
    mounted.clickText('Save as What If Scenario');

    expect(mounted.container.textContent).toContain('Saved to What If scenarios as “Fixed Target - Blend DC first test”.');
    expect(mounted.container.textContent).toContain('Open the What If page when you want to load, edit, or compare it.');
    expect(mounted.config.drawdown_stages).toEqual(initialStages);
    expect(mounted.config.withdrawal_priority).toEqual(initialPriority);

    const scenarios = loadScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]?.name).toBe('Fixed Target - Blend DC first test');
    expect(scenarios[0]?.config.drawdown_stages?.[0]?.name).toBe('Blend DC pensions first');
    expect(scenarios[0]?.config.drawdown_stages?.[0]?.sources).toEqual([
      { source_type: 'dc_pot', source_name: 'Main DC', target_share: 0.5 },
      { source_type: 'dc_pot', source_name: 'Second DC', target_share: 0.5 },
    ]);
  });

  it('updates the Current Plan from a selected strategy candidate without changing pension-access events', () => {
    mounted = renderOptimise({
      ...makeStrategyConfig(),
      pension_access_events: [{
        id: 'planned_tfc',
        pot_ref: 'Main DC',
        event_type: 'tax_free_cash',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'percentage_of_estimated_tfc_remaining', value: 1 },
        destination: { kind: 'outside_plan' },
      }],
    });

    mounted.clickText('Blend DC pensions first, then tax-free accounts');
    mounted.clickText('Update Current Plan');

    expect(mounted.config.drawdown_stages?.[0]?.name).toBe('Blend DC pensions first');
    expect(mounted.config.drawdown_stages?.[0]?.sources).toEqual([
      { source_type: 'dc_pot', source_name: 'Main DC', target_share: 0.5 },
      { source_type: 'dc_pot', source_name: 'Second DC', target_share: 0.5 },
    ]);
    expect(mounted.config.withdrawal_priority).toEqual(['Main DC', 'Second DC', 'ISA']);
    expect(mounted.config.pension_access_events?.map(event => event.id)).toEqual(['planned_tfc']);
  });
});
