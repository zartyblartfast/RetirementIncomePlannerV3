import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ConfigPanel from '../ConfigPanel';
import ConfigProvider from '../../../store/ConfigProvider';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderConfigPanel() {
  const container = document.createElement('div');
  let root: Root;

  act(() => {
    root = createRoot(container);
    root.render(
      <MemoryRouter>
        <ConfigProvider>
          <ConfigPanel />
        </ConfigProvider>
      </MemoryRouter>,
    );
  });

  return {
    container,
    unmount() {
      act(() => root.unmount());
    },
  };
}

describe('ConfigPanel growth assumptions', () => {
  let mounted: ReturnType<typeof renderConfigPanel> | null = null;

  beforeEach(() => {
    localStorage.clear();
    mounted = null;
  });

  afterEach(() => {
    mounted?.unmount();
    localStorage.clear();
  });

  it('keeps historical Suggest controls visible beside growth-rate inputs', () => {
    mounted = renderConfigPanel();

    const suggestButtons = Array.from(mounted.container.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Suggest',
    );

    expect(suggestButtons.length).toBeGreaterThanOrEqual(2);
    expect(mounted.container.textContent).toContain(
      'Current rate is editable; use Suggest to compare historical allocation-based rates.',
    );
    expect(mounted.container.textContent).not.toContain(
      'Auto-filled from asset allocation; edit here to override.',
    );
  });
});
