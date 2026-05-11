import type { YearRow } from '../../engine/types';

export interface IncomeBreakdownNames {
  guarNames: string[];
  drawdownNames: string[];
}

export type IncomeBreakdownRow = Record<string, number | null>;

export function getIncomeBreakdownNames(years: YearRow[]): IncomeBreakdownNames {
  const guars = new Set<string>();
  const drawdowns = new Set<string>();

  for (const yr of years) {
    for (const k of Object.keys(yr.guaranteed_income)) guars.add(k);
    for (const k of Object.keys(yr.pot_pnl)) drawdowns.add(k);
  }

  return { guarNames: [...guars], drawdownNames: [...drawdowns] };
}

export function buildIncomeBreakdownData(
  years: YearRow[],
  names: IncomeBreakdownNames = getIncomeBreakdownNames(years),
): IncomeBreakdownRow[] {
  return years.map(yr => {
    const row: IncomeBreakdownRow = {
      age: yr.age,
      target_net: Math.round(yr.target_net),
      net_achieved: Math.round(yr.net_income_achieved),
      tax: yr.tax_due > 0 ? -Math.round(yr.tax_due) : null,
    };

    for (const n of names.guarNames) {
      const v = yr.guaranteed_income[n] ?? 0;
      row[`guar_${n}`] = v > 0 ? Math.round(v) : null;
    }

    for (const n of names.drawdownNames) {
      const v = yr.pot_pnl[n]?.withdrawal ?? 0;
      row[`draw_${n}`] = v > 0 ? Math.round(v) : null;
    }

    return row;
  });
}
