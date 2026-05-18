import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigProvider from '../../../store/ConfigProvider';
import OnboardingWizard from '../OnboardingWizard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderWizard() {
  const container = document.createElement('div');
  let root: Root;

  act(() => {
    root = createRoot(container);
    root.render(
      <ConfigProvider>
        <OnboardingWizard onDone={vi.fn()} />
      </ConfigProvider>,
    );
  });

  return {
    container,
    clickButton(label: string) {
      const button = Array.from(container.querySelectorAll('button')).find(
        candidate => candidate.textContent?.trim() === label,
      );
      expect(button).toBeTruthy();
      act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    clickCheckbox(labelText: string) {
      const label = Array.from(container.querySelectorAll('label')).find(
        candidate => candidate.textContent?.includes(labelText),
      );
      const checkbox = label?.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
      act(() => checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

describe('OnboardingWizard growth assumptions', () => {
  let mounted: ReturnType<typeof renderWizard> | null = null;

  beforeEach(() => {
    localStorage.clear();
    mounted = null;
  });

  afterEach(() => {
    mounted?.unmount();
    localStorage.clear();
  });

  it('shows Suggest controls on setup growth-rate fields', () => {
    mounted = renderWizard();

    mounted.clickButton('Next');
    mounted.clickButton('Next');
    mounted.clickButton('Next');

    expect(mounted.container.textContent).toContain('Pension pot');
    expect(mounted.container.textContent).toContain('Suggest');

    mounted.clickButton('Next');
    mounted.clickCheckbox('I have an ISA or tax-free savings account');

    expect(mounted.container.textContent).toContain('ISA / savings');
    expect(mounted.container.textContent).toContain('Suggest');
  });
});
