import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { YearRow } from '../../../engine/types';
import YearTable from '../YearTable';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function yearWithTfcEvent(): YearRow {
  return {
    age: 67,
    tax_year: '2032/33',
    target_net: 25000,
    guaranteed_income: { 'State Pension': 12000 },
    guaranteed_total: 12000,
    dc_withdrawal_gross: 8000,
    dc_tax_free_portion: 2000,
    tf_withdrawal: 5000,
    withdrawal_detail: { 'DC Pension': 6000 },
    total_taxable_income: 18000,
    tax_due: 1000,
    tax_breakdown: {
      total: 1000,
      taxable_income: 18000,
      personal_allowance: 12570,
      income_after_pa: 5430,
      bands: [{ name: 'Basic rate', rate: 0.2, width: 37700, taxable_in_band: 5430, tax: 1086 }],
      marginal_rate: 0.2,
      tax_cap_applied: false,
    },
    net_income_achieved: 24000,
    shortfall: false,
    pot_balances: { 'DC Pension': 185000 },
    tf_balances: { ISA: 50000 },
    total_capital: 235000,
    pot_pnl: {
      'DC Pension': {
        opening: 200000,
        growth: 3000,
        fees: 1000,
        withdrawal: 17000,
        closing: 185000,
        provenance: { source: 'user_config', detail: 'Configured rate', rate: 0.04 },
      },
      ISA: {
        opening: 50000,
        growth: 1000,
        fees: 0,
        withdrawal: 1000,
        closing: 50000,
        provenance: { source: 'user_config', detail: 'Configured rate', rate: 0.03 },
      },
    },
    pension_access_events: [
      {
        id: 'retirement_tfc',
        pot_ref: 'DC Pension',
        pot_name: 'DC Pension',
        projection_year: '2032',
        month: 1,
        order_in_month: 0,
        event_type: 'tax_free_cash',
        gross_amount: 10000,
        tax_free_amount: 10000,
        taxable_amount: 0,
        pot_balance_before: 200000,
        pot_balance_after: 190000,
        estimated_tfc_used: 10000,
        estimated_tfc_remaining: 40000,
        caveats: ['simplified_tfc_event_no_lsa_lsdba_tracking'],
      },
    ],
  };
}

function yearWithTaxableFadEvent(): YearRow {
  return {
    ...yearWithTfcEvent(),
    dc_withdrawal_gross: 20000,
    dc_tax_free_portion: 0,
    withdrawal_detail: { 'DC Pension': 20000 },
    total_taxable_income: 20000,
    tax_due: 1486,
    net_income_achieved: 18514,
    pot_balances: { 'DC Pension': 70000 },
    total_capital: 70000,
    pension_access_events: [
      {
        id: 'taxable_fad_1',
        pot_ref: 'DC Pension',
        pot_name: 'DC Pension',
        projection_year: '2032',
        month: 1,
        order_in_month: 1,
        event_type: 'taxable_flexi_access_drawdown',
        gross_amount: 20000,
        tax_free_amount: 0,
        taxable_amount: 20000,
        pot_balance_before: 90000,
        pot_balance_after: 70000,
        uncrystallised_balance_before: 60000,
        uncrystallised_balance_after: 60000,
        crystallised_drawdown_balance_before: 30000,
        crystallised_drawdown_balance_after: 10000,
        estimated_tfc_used: 0,
        estimated_tfc_remaining: 22500,
        caveats: ['mpaa_triggered_by_taxable_drawdown'],
      },
    ],
  };
}

function renderYearTable(years: YearRow[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(<YearTable years={years} />));
  return {
    container,
    clickText(text: string) {
      const target = Array.from(container.querySelectorAll('td, button, span'))
        .find(el => el.textContent === text);
      if (!target) throw new Error(`Text not found: ${text}`);
      act(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted: ReturnType<typeof renderYearTable> | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe('YearTable pension access event visibility', () => {
  it('surfaces applied TFC capital events in the expanded year detail without presenting them as ordinary income', () => {
    mounted = renderYearTable([yearWithTfcEvent()]);

    mounted.clickText('67');

    expect(mounted.container.textContent).toContain('Pension access events');
    expect(mounted.container.textContent).toContain('DC Pension tax-free cash: £10,000');
    expect(mounted.container.textContent).toContain('Pot balance £200,000 → £190,000');
    expect(mounted.container.textContent).toContain('Capital event: not included in ordinary DC gross, taxable income, or tax.');
    expect(mounted.container.textContent).toContain('Pot Withdrawals (net)');
  });

  it('surfaces explicit taxable FAD as taxable income from crystallised drawdown in expanded detail', () => {
    mounted = renderYearTable([yearWithTaxableFadEvent()]);

    mounted.clickText('67');

    expect(mounted.container.textContent).toContain('Pension access events');
    expect(mounted.container.textContent).toContain('DC Pension taxable flexi-access drawdown: £20,000');
    expect(mounted.container.textContent).toContain('Taxable drawdown: £20,000 taxable pension income, £0 tax-free.');
    expect(mounted.container.textContent).toContain('Crystallised drawdown £30,000 → £10,000');
    expect(mounted.container.textContent).toContain('Uncrystallised £60,000 → £60,000');
    expect(mounted.container.textContent).toContain('MPAA triggered by taxable drawdown');
  });
});
