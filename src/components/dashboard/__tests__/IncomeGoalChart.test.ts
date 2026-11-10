import { describe, expect, it } from 'vitest';
import { runProjection } from '../../../engine/projection';
import { DEFAULT_CONFIG } from '../../../engine/__tests__/fixtures';
import { buildIncomeGoalData } from '../IncomeGoalChart';

describe('income goal chart data', () => {
  it('uses the plan projection annual ages, net income and strategy targets without rounding', () => {
    const years = runProjection(DEFAULT_CONFIG).years;
    const data = buildIncomeGoalData(years);

    expect(data).toHaveLength(years.length);
    for (const [index, year] of years.entries()) {
      expect(data[index]).toEqual({
        age: year.age,
        net: year.net_income_achieved,
        target: year.target_net,
      });
    }
  });

  it('has an empty state when no annual rows are available', () => {
    expect(buildIncomeGoalData([])).toEqual([]);
  });
});
