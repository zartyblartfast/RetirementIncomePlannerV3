import { describe, expect, it } from 'vitest';
import { runProjection } from '../../../engine/projection';
import { DEFAULT_CONFIG } from '../../../engine/__tests__/fixtures';
import { buildIncomeBreakdownData } from '../chartData';

function rowIncomeTotal(row: Record<string, number | null>): number {
  return Object.entries(row).reduce((sum, [key, value]) => {
    if (
      value == null ||
      key === 'age' ||
      key === 'target_net' ||
      key === 'net_achieved'
    ) {
      return sum;
    }
    return sum + value;
  }, 0);
}

describe('dashboard chart data', () => {
  it('income breakdown bars reconcile to net income achieved', () => {
    const result = runProjection(DEFAULT_CONFIG);
    const data = buildIncomeBreakdownData(result.years);

    for (const row of data) {
      expect(Math.abs(rowIncomeTotal(row) - (row.net_achieved as number))).toBeLessThanOrEqual(2);
    }
  });

  it('uses gross pot withdrawals for drawdown bars', () => {
    const result = runProjection(DEFAULT_CONFIG);
    const firstYear = result.years[0]!;
    const data = buildIncomeBreakdownData([firstYear]);
    const row = data[0]!;

    for (const [name, pnl] of Object.entries(firstYear.pot_pnl)) {
      const chartValue = row[`draw_${name}`] ?? 0;
      expect(chartValue).toBe(Math.round(pnl.withdrawal));
    }
  });
});
