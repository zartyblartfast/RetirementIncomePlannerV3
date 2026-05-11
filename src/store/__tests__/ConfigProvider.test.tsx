import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ConfigProvider from '../ConfigProvider';
import { DEFAULT_CONFIG, useConfig, type ConfigContextValue } from '../configStore';
import type { PlannerConfig } from '../../engine/types';

const STORAGE_KEY = 'rip_v2_config';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderProvider() {
  let value: ConfigContextValue | undefined;
  const container = document.createElement('div');
  let root: Root;

  function Probe() {
    value = useConfig();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(
      <ConfigProvider>
        <Probe />
      </ConfigProvider>,
    );
  });

  return {
    get value() {
      if (!value) throw new Error('ConfigProvider test probe was not rendered');
      return value;
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

describe('ConfigProvider first-run flow', () => {
  let mounted: ReturnType<typeof renderProvider> | null = null;

  beforeEach(() => {
    localStorage.clear();
    mounted = null;
  });

  afterEach(() => {
    mounted?.unmount();
    localStorage.clear();
  });

  it('starts in first-visit mode when no config is stored', () => {
    mounted = renderProvider();

    expect(mounted.value.isFirstVisit).toBe(true);
    expect(mounted.value.config).toEqual(DEFAULT_CONFIG);
  });

  it('loads a stored config, skips first-visit mode, and strips legacy retirement_age', () => {
    const legacyConfig = {
      ...DEFAULT_CONFIG,
      personal: {
        ...DEFAULT_CONFIG.personal,
        retirement_age: 67,
      },
      drawdown_strategy: 'arva',
      drawdown_strategy_params: { assumed_real_return_pct: 3 },
    } as PlannerConfig & { personal: PlannerConfig['personal'] & { retirement_age: number } };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyConfig));
    mounted = renderProvider();

    expect(mounted.value.isFirstVisit).toBe(false);
    expect('retirement_age' in mounted.value.config.personal).toBe(false);
    expect(mounted.value.config.drawdown_strategy).toBe('arva');
    expect(mounted.value.config.drawdown_strategy_params).toEqual({ assumed_real_return_pct: 3 });
  });

  it('supports the first-run import path: set config, persist it, then mark configured', () => {
    mounted = renderProvider();
    const importedConfig: PlannerConfig = {
      ...DEFAULT_CONFIG,
      personal: {
        ...DEFAULT_CONFIG.personal,
        retirement_date: '2035-01',
      },
      target_income: {
        ...DEFAULT_CONFIG.target_income,
        net_annual: 36_000,
      },
    };

    act(() => {
      mounted!.value.setConfig(importedConfig);
      mounted!.value.markConfigured();
    });

    expect(mounted.value.isFirstVisit).toBe(false);
    expect(mounted.value.config.target_income.net_annual).toBe(36_000);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).target_income.net_annual).toBe(36_000);
  });

  it('normalizes imported config withdrawal_priority through setConfig', () => {
    mounted = renderProvider();
    const importedConfig = {
      ...DEFAULT_CONFIG,
      dc_pots: [
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Renamed DC' },
      ],
      tax_free_accounts: [
        { ...DEFAULT_CONFIG.tax_free_accounts[0]!, name: 'ISA' },
      ],
      withdrawal_priority: ['Old DC', 'ISA', 'ISA'],
    } as PlannerConfig;

    act(() => {
      mounted!.value.setConfig(importedConfig);
    });

    expect(mounted.value.config.withdrawal_priority).toEqual(['ISA', 'Renamed DC']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).withdrawal_priority).toEqual([
      'ISA',
      'Renamed DC',
    ]);
  });

  it('normalizes withdrawal_priority after updateConfig changes drawable sources', () => {
    mounted = renderProvider();

    act(() => {
      mounted!.value.updateConfig(prev => ({
        ...prev,
        dc_pots: [
          { ...prev.dc_pots[0]!, name: 'Main DC' },
          { ...prev.dc_pots[0]!, name: 'Second DC' },
        ],
        tax_free_accounts: [],
        withdrawal_priority: ['Missing', 'Main DC', 'Main DC'],
      }));
    });

    expect(mounted.value.config.withdrawal_priority).toEqual(['Main DC', 'Second DC']);
  });

  it('reset removes stored config and returns to first-visit mode', () => {
    mounted = renderProvider();

    act(() => {
      mounted!.value.setConfig(DEFAULT_CONFIG);
      mounted!.value.markConfigured();
    });
    expect(mounted.value.isFirstVisit).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    act(() => {
      mounted!.value.resetToDefault();
    });

    expect(mounted.value.isFirstVisit).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
