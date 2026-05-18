import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlannerConfig } from '../../../engine/types';
import { DEFAULT_CONFIG } from '../../../store/configStore';
import SandboxControls from '../SandboxControls';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function cloneConfig(cfg: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(cfg)) as PlannerConfig;
}

function renderSandboxControls(initialConfig: PlannerConfig) {
  let currentConfig = initialConfig;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function renderWithConfig(config: PlannerConfig) {
    currentConfig = config;
    root.render(<SandboxControls config={config} onChange={renderWithConfig} />);
  }

  act(() => renderWithConfig(initialConfig));

  return {
    container,
    get config() {
      return currentConfig;
    },
    chooseSelectByLabel(label: string, value: string) {
      const labelEl = Array.from(container.querySelectorAll('label')).find(el => el.textContent?.includes(label));
      const select = labelEl?.querySelector('select');
      if (!select) throw new Error(`Select not found for label: ${label}`);
      act(() => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted: ReturnType<typeof renderSandboxControls> | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe('SandboxControls pension access scenarios', () => {
  it('requires an explicit pension pot choice for a What If TFC event when multiple DC pots exist', () => {
    mounted = renderSandboxControls({
      ...cloneConfig(DEFAULT_CONFIG),
      dc_pots: [
        DEFAULT_CONFIG.dc_pots[0]!,
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'SIPP 2', starting_balance: 120000 },
      ],
    });

    mounted.chooseSelectByLabel('Tax-free cash event', 'retirement_tfc');

    expect(mounted.container.textContent).toContain('Pension pot');
    expect(mounted.container.textContent).toContain('DC Pension');
    expect(mounted.container.textContent).toContain('SIPP 2');
    expect(mounted.container.textContent).toContain('from DC Pension');
    expect(mounted.container.textContent).toContain('Currently modelled as pot reduction only');
    expect(mounted.container.textContent).toContain('Released cash is not yet added to a modelled cash, ISA, or other destination account.');

    mounted.chooseSelectByLabel('Pension pot', 'SIPP 2');

    expect(mounted.config.pension_access_events?.find(event => event.id === 'sandbox_retirement_tfc')?.pot_ref).toBe('SIPP 2');
    expect(mounted.container.textContent).toContain('from SIPP 2');
  });
});
