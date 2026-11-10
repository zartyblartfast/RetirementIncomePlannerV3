import { cloneElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { runProjection } from '../../../engine/projection';
import { DEFAULT_CONFIG } from '../../../engine/__tests__/fixtures';
import ProjectionChart from '../ProjectionChart';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 340 }),
  };
});

describe('ProjectionChart', () => {
  it('presents income before capital for the projection', () => {
    const result = runProjection(DEFAULT_CONFIG);
    const html = renderToStaticMarkup(
      <ProjectionChart years={result.years} summary={result.summary} strategyName="Fixed target" incomeFirst />,
    );

    expect(html).toContain('Income Breakdown');
    expect(html).toContain('Capital Trajectory');
    expect(html.indexOf('Income Breakdown')).toBeLessThan(html.indexOf('Capital Trajectory'));
    expect(html).toContain('Drawdown Strategy: Fixed target');
  });

  it('retains the original capital-first order elsewhere', () => {
    const result = runProjection(DEFAULT_CONFIG);
    const html = renderToStaticMarkup(<ProjectionChart years={result.years} summary={result.summary} />);

    expect(html.indexOf('Capital Trajectory')).toBeLessThan(html.indexOf('Income Breakdown'));
  });

  it('draws the dashed target over the achieved-income line when they coincide', () => {
    const result = runProjection(DEFAULT_CONFIG);
    const html = renderToStaticMarkup(<ProjectionChart years={result.years} summary={result.summary} incomeFirst />);
    const document = new DOMParser().parseFromString(html, 'text/html');
    const lines = [...document.querySelectorAll('.recharts-line-curve')];

    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute('stroke')).toBe('#10ac84');
    expect(lines[1]?.getAttribute('stroke')).toBe('#222f3e');
    expect(lines[1]?.getAttribute('stroke-dasharray')).toBe('8 6');
    expect(html).toContain('Where they overlap, income tracks the comparison line.');
  });
});
