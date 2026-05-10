import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import type { PlannerConfig, YearRow, MonthlyRow } from '../types';
import { DEFAULT_CONFIG } from './fixtures';
import { buildIncomeBreakdownData } from '../../components/dashboard/chartData';

const MONEY_TOLERANCE = 1.25;
const ROUNDING_TOLERANCE = 2;

function cloneConfig(config: PlannerConfig): PlannerConfig {
  return JSON.parse(JSON.stringify(config)) as PlannerConfig;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumRecord(record: Record<string, number>): number {
  return sum(Object.values(record));
}

function monthlyRowsForYear(monthlyRows: MonthlyRow[], year: YearRow): MonthlyRow[] {
  return monthlyRows.filter(row => row.age === year.age);
}

function roundedChartIncomeTotal(row: Record<string, number | null>): number {
  return Object.entries(row).reduce((total, [key, value]) => {
    if (
      value == null ||
      key === 'age' ||
      key === 'target_net' ||
      key === 'net_achieved'
    ) {
      return total;
    }

    return total + value;
  }, 0);
}

function expectMoneyClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(MONEY_TOLERANCE);
}

function baseNoTaxConfig(): PlannerConfig {
  return {
    personal: {
      date_of_birth: '1960-01',
      retirement_date: '2028-01',
      end_age: 69,
      currency: 'GBP',
    },
    target_income: {
      net_annual: 0,
      cpi_rate: 0,
    },
    guaranteed_income: [],
    dc_pots: [],
    tax_free_accounts: [],
    withdrawal_priority: [],
    tax: {
      regime: 'test',
      personal_allowance: 0,
      bands: [{ name: 'zero', width: null, rate: 0 }],
      tax_cap_enabled: false,
      tax_cap_amount: 200000,
    },
  };
}

describe('internal projection consistency checks', () => {
  it('reconciles monthly rows back to annual YearRow outputs', () => {
    const result = runProjection(DEFAULT_CONFIG, { includeMonthly: true });

    expect(result.monthly_rows).toBeDefined();
    const monthlyRows = result.monthly_rows!;

    for (const year of result.years) {
      const months = monthlyRowsForYear(monthlyRows, year);
      expect(months.length).toBeGreaterThan(0);
      expect(months.length).toBeLessThanOrEqual(12);

      expectMoneyClose(sum(months.map(row => row.target_monthly)), year.target_net);
      expectMoneyClose(sum(months.map(row => row.guaranteed_total)), year.guaranteed_total);
      expectMoneyClose(sum(months.map(row => row.gross_income)), year.guaranteed_total + year.dc_withdrawal_gross + year.tf_withdrawal);
      expectMoneyClose(sum(months.map(row => row.withdrawal_total)), sumRecord(year.withdrawal_detail));

      for (const sourceName of Object.keys(year.guaranteed_income)) {
        const monthlyTotal = sum(months.map(row => row.guaranteed_detail[sourceName] ?? 0));
        expectMoneyClose(monthlyTotal, year.guaranteed_income[sourceName] ?? 0);
      }

      for (const sourceName of Object.keys(year.withdrawal_detail)) {
        const monthlyTotal = sum(months.map(row => row.withdrawal_detail[sourceName] ?? 0));
        expectMoneyClose(monthlyTotal, year.withdrawal_detail[sourceName] ?? 0);
      }

      const lastMonth = months[months.length - 1]!;
      expectMoneyClose(lastMonth.total_capital, year.total_capital);
      for (const [potName, balance] of Object.entries(year.pot_balances)) {
        expectMoneyClose(lastMonth.dc_balances[potName] ?? 0, balance);
      }
      for (const [accountName, balance] of Object.entries(year.tf_balances)) {
        expectMoneyClose(lastMonth.tf_balances[accountName] ?? 0, balance);
      }
    }
  });

  it('applies guaranteed-income start and stop dates only to active months', () => {
    const config = baseNoTaxConfig();
    config.guaranteed_income = [
      {
        name: 'Bridge Pension',
        gross_annual: 12000,
        indexation_rate: 0,
        start_date: '2028-04',
        end_date: '2028-09',
        taxable: true,
        values_as_of: '2028-01',
      },
    ];

    const result = runProjection(config, { includeMonthly: true });
    const firstYear = result.years[0]!;
    const firstYearMonths = monthlyRowsForYear(result.monthly_rows!, firstYear);

    expect(firstYear.age).toBe(68);
    expect(firstYear.guaranteed_income['Bridge Pension']).toBe(6000);
    expect(firstYear.guaranteed_total).toBe(6000);
    expect(firstYearMonths.map(row => row.guaranteed_total)).toEqual([
      0, 0, 0, 1000, 1000, 1000, 1000, 1000, 1000, 0, 0, 0,
    ]);

    const secondYear = result.years[1]!;
    expect(secondYear.guaranteed_income['Bridge Pension']).toBe(0);
    expect(secondYear.guaranteed_total).toBe(0);
  });

  it('records depletion and clears residual balances rather than leaving tiny stranded pots', () => {
    const config = baseNoTaxConfig();
    config.personal.end_age = 69;
    config.dc_pots = [
      {
        name: 'Residual DC Pot',
        starting_balance: 49,
        growth_rate: 0,
        annual_fees: 0,
        tax_free_portion: 1,
        values_as_of: '2028-01',
      },
    ];
    config.withdrawal_priority = ['Residual DC Pot'];

    const result = runProjection(config, { includeMonthly: true });
    const year = result.years[0]!;

    expect(year.pot_pnl['Residual DC Pot']?.withdrawal).toBe(49);
    expect(year.pot_balances['Residual DC Pot']).toBe(0);
    expect(result.summary.remaining_pots['Residual DC Pot']).toBe(0);
    expect(result.summary.remaining_capital).toBe(0);
    expect(result.summary.first_pot_exhausted_age).toBe(68);
    expect(result.summary.depletion_events).toEqual([
      { pot: 'Residual DC Pot', age: 68, month: 1 },
    ]);
    expect(result.monthly_rows![0]!.depleted_this_month).toEqual(['Residual DC Pot']);
  });

  it('keeps annual rows, table fields, and income chart data reconciled', () => {
    const config = cloneConfig(DEFAULT_CONFIG);
    const result = runProjection(config);
    const chartRows = buildIncomeBreakdownData(result.years);

    for (const [index, year] of result.years.entries()) {
      const chartRow = chartRows[index]!;

      expectMoneyClose(year.guaranteed_total, sumRecord(year.guaranteed_income));
      expect(year.dc_withdrawal_gross).toBeCloseTo(
        sum(Object.entries(year.pot_pnl)
          .filter(([sourceName]) => sourceName in year.pot_balances)
          .map(([, pnl]) => pnl.withdrawal)),
        2,
      );
      expect(year.tf_withdrawal).toBeCloseTo(
        sum(Object.entries(year.pot_pnl)
          .filter(([sourceName]) => sourceName in year.tf_balances)
          .map(([, pnl]) => pnl.withdrawal)),
        2,
      );
      expectMoneyClose(year.total_capital, sumRecord(year.pot_balances) + sumRecord(year.tf_balances));
      expectMoneyClose(year.net_income_achieved, year.guaranteed_total + year.dc_withdrawal_gross + year.tf_withdrawal - year.tax_due);
      expect(year.tax_due).toBeCloseTo(year.tax_breakdown.total, 2);
      expect(year.total_taxable_income).toBeCloseTo(year.tax_breakdown.taxable_income, 2);

      expect(chartRow.age).toBe(year.age);
      expect(chartRow.target_net).toBe(Math.round(year.target_net));
      expect(chartRow.net_achieved).toBe(Math.round(year.net_income_achieved));
      expect(Math.abs(roundedChartIncomeTotal(chartRow) - Math.round(year.net_income_achieved))).toBeLessThanOrEqual(ROUNDING_TOLERANCE);

      for (const [name, amount] of Object.entries(year.guaranteed_income)) {
        expect(chartRow[`guar_${name}`]).toBe(amount > 0 ? Math.round(amount) : null);
      }
      for (const [name, pnl] of Object.entries(year.pot_pnl)) {
        expect(chartRow[`draw_${name}`]).toBe(pnl.withdrawal > 0 ? Math.round(pnl.withdrawal) : null);
      }
    }
  });
});
