import { describe, it, expect } from 'vitest';
import { computeYearWorkings } from '../workings';
import { runProjection } from '../projection';
import { DEFAULT_CONFIG } from './fixtures';
import { deriveTaxContext } from '../taxContext';

describe('computeYearWorkings', () => {
  const result = runProjection(DEFAULT_CONFIG);
  const yr1 = result.years[0]!;

  it('returns a WorkingsReport with steps', () => {
    const w = computeYearWorkings(yr1);
    expect(w).toHaveProperty('steps');
    expect(w.steps.length).toBeGreaterThan(0);
  });

  it('step labels are non-empty strings', () => {
    const w = computeYearWorkings(yr1);
    for (const step of w.steps) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });

  it('income_identity cross-check delta is less than 1', () => {
    const w = computeYearWorkings(yr1);
    const check = w.steps.find(s => s.id === 'income_identity');
    expect(check).toBeDefined();
    expect(check!.delta).toBeLessThan(1);
  });

  it('tax_recheck cross-check delta is less than 1', () => {
    const w = computeYearWorkings(yr1);
    const check = w.steps.find(s => s.id === 'tax_recheck');
    expect(check).toBeDefined();
    expect(check!.delta).toBeLessThan(1);
  });

  it('all cross-check steps have a delta defined', () => {
    const w = computeYearWorkings(yr1);
    const crossChecks = w.steps.filter(s => s.isCrossCheck);
    expect(crossChecks.length).toBeGreaterThan(0);
    for (const s of crossChecks) {
      expect(s.delta).toBeDefined();
    }
  });

  it('reports correct age and taxYear', () => {
    const w = computeYearWorkings(yr1);
    expect(w.age).toBe(yr1.age);
    expect(w.taxYear).toBe(yr1.tax_year);
  });

  it('includes supplied tax context for audit display', () => {
    const taxContext = deriveTaxContext(DEFAULT_CONFIG.tax);
    const w = computeYearWorkings(yr1, taxContext);

    expect(w.taxContext).toEqual(taxContext);
  });

  it('explains the DC tax-free cash assumption as gradual pro-rata', () => {
    const w = computeYearWorkings({
      ...yr1,
      dc_withdrawal_gross: 12000,
      dc_tax_free_portion: 3000,
    });

    const step = w.steps.find(s => s.id === 'dc_tax_free');
    expect(step).toBeDefined();
    expect(step!.label).toBe('DC tax-free pension element');
    expect(step!.formula).toContain('Gradual pro-rata assumption: 25.0% of ordinary DC withdrawals treated as tax-free');
    expect(step!.formula).toContain('£12,000 gross gives £3,000 tax-free');
    expect(step!.formula).toContain('No upfront lump sum is modelled in this workings path');
  });

  it('includes staged drawdown allocation detail when present on the year row', () => {
    const w = computeYearWorkings({
      ...yr1,
      drawdown_stage_allocations: [
        {
          stage_id: 'stage_blend',
          stage_name: 'Blend DC and ISA',
          source_type: 'dc_pot',
          source_name: 'Main DC',
          target_share: 0.5,
          actual_gross_withdrawal: 11000,
          actual_net_income: 10000,
          tax_free_amount: 2750,
          taxable_amount: 8250,
        },
      ],
    });

    const step = w.steps.find(s => s.id === 'drawdown_stage_allocation_stage_blend_Main_DC');
    expect(step).toBeDefined();
    expect(step!.label).toBe('Drawdown stage allocation: Blend DC and ISA / Main DC');
    expect(step!.formula).toContain('Target split 50.0%');
    expect(step!.formula).toContain('actual source split 100.0%');
    expect(step!.formula).toContain('gross £11,000');
    expect(step!.formula).toContain('net £10,000');
    expect(step!.formula).toContain('tax-free £2,750');
    expect(step!.formula).toContain('taxable £8,250');
    expect(step!.value).toBe(10000);
  });

  it('includes staged drawdown transition detail when stages change during the year', () => {
    const w = computeYearWorkings({
      ...yr1,
      drawdown_stage_transitions: [
        {
          month: 2,
          from_stage_id: 'stage_blend',
          from_stage_name: 'Opening blend',
          to_stage_id: 'stage_sipp',
          to_stage_name: 'SIPP later',
          reason: 'stage_depleted',
        },
      ],
    });

    const step = w.steps.find(s => s.id === 'drawdown_stage_transition_2_stage_blend_stage_sipp');
    expect(step).toBeDefined();
    expect(step!.label).toBe('Drawdown stage transition: month 2');
    expect(step!.formula).toBe('Opening blend → SIPP later because stage depleted');
    expect(step!.value).toBe(2);
  });

  it('includes foundation-only pension access events when present on the year row', () => {
    const w = computeYearWorkings({
      ...yr1,
      pension_access_events: [
        {
          id: 'planned_tfc',
          pot_ref: 'DC Pension',
          pot_name: 'DC Pension',
          projection_year: '2032',
          month: 1,
          order_in_month: 0,
          event_type: 'tax_free_cash',
          gross_amount: 10000,
          tax_free_amount: 0,
          taxable_amount: 0,
          pot_balance_before: 0,
          pot_balance_after: 0,
          estimated_tfc_used: 0,
          estimated_tfc_remaining: 0,
          caveats: ['foundation_only_not_applied'],
        },
      ],
    });

    const step = w.steps.find(s => s.id === 'pension_access_event_planned_tfc');
    expect(step).toBeDefined();
    expect(step!.label).toBe('Pension access event: DC Pension');
    expect(step!.formula).toContain('Month 1: tax-free cash event for DC Pension');
    expect(step!.formula).toContain('planned only');
    expect(step!.formula).toContain('Gross/tax-free amount £10,000');
    expect(step!.formula).toContain('foundation metadata only — not applied to balances, income, or tax yet');
    expect(step!.value).toBe(10000);
  });

  it('explains applied pension access TFC events as capital events separate from ordinary income and tax', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.pension_access_events = [
      {
        id: 'retirement_tfc',
        pot_ref: cfg.dc_pots[0]!.name,
        event_type: 'tax_free_cash',
        timing: { kind: 'retirement_date' },
        amount: { kind: 'fixed_amount', value: 10000 },
        destination: { kind: 'outside_plan' },
      },
    ];

    const result = runProjection(cfg);
    const eventYear = result.years.find(yr => yr.pension_access_events?.some(event => event.id === 'retirement_tfc'))!;
    const w = computeYearWorkings(eventYear);

    const dcTaxFreeStep = w.steps.find(s => s.id === 'dc_tax_free');
    expect(dcTaxFreeStep).toBeDefined();
    expect(dcTaxFreeStep!.formula).toContain('Separate pension access / TFC capital events for this year are shown below');
    expect(dcTaxFreeStep!.formula).toContain('not counted as ordinary DC income');

    const eventStep = w.steps.find(s => s.id === 'pension_access_event_retirement_tfc');
    expect(eventStep).toBeDefined();
    expect(eventStep!.formula).toContain('applied as a separate capital event, reducing the pension pot but not ordinary income, taxable income, or tax');
    expect(eventStep!.formula).toContain('Gross/tax-free amount £10,000');
    expect(eventStep!.formula).toContain('taxable amount £0');
    expect(eventStep!.formula).toContain('Pot balance');
    expect(eventStep!.formula).toContain('before →');
    expect(eventStep!.formula).toContain('after');
    expect(eventStep!.formula).toContain('Estimated TFC used £10,000');
    expect(eventStep!.formula).toContain('simplified TFC event — no LSA/LSDBA/provider/MPAA tracking is modelled');
    expect(eventStep!.value).toBeCloseTo(10000, 2);
  });

  it('explains explicit taxable flexi-access drawdown as taxable income from crystallised drawdown balance', () => {
    const yr = {
      ...yr1,
      dc_withdrawal_gross: 20000,
      dc_tax_free_portion: 0,
      total_taxable_income: 20000,
      pension_access_events: [
        {
          id: 'taxable_fad_1',
          pot_ref: 'DC Pension',
          pot_name: 'DC Pension',
          projection_year: '2032',
          month: 1,
          order_in_month: 1,
          event_type: 'taxable_flexi_access_drawdown' as const,
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

    const w = computeYearWorkings(yr);

    const dcTaxFreeStep = w.steps.find(s => s.id === 'dc_tax_free');
    expect(dcTaxFreeStep).toBeDefined();
    expect(dcTaxFreeStep!.formula).toContain('includes explicit taxable flexi-access drawdown events');

    const eventStep = w.steps.find(s => s.id === 'pension_access_event_taxable_fad_1');
    expect(eventStep).toBeDefined();
    expect(eventStep!.formula).toContain('applied as taxable flexi-access drawdown from crystallised drawdown balance');
    expect(eventStep!.formula).toContain('100% taxable pension income');
    expect(eventStep!.formula).toContain('Crystallised drawdown balance £30,000 → £10,000');
    expect(eventStep!.formula).toContain('Uncrystallised balance £60,000 → £60,000');
    expect(eventStep!.formula).toContain('MPAA triggered by taxable drawdown');
  });
});
