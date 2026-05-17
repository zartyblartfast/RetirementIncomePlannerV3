import { describe, it, expect, beforeEach } from 'vitest'
import { hasStoredConfig, loadConfig, saveConfig, resetConfig, DEFAULT_CONFIG } from '../configStore'
import type { PlannerConfig } from '../../engine/types'

const STORAGE_KEY = 'rip_v2_config'

describe('hasStoredConfig', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns false when localStorage is empty', () => {
    expect(hasStoredConfig()).toBe(false)
  })

  it('returns true after saveConfig is called', () => {
    saveConfig(DEFAULT_CONFIG)
    expect(hasStoredConfig()).toBe(true)
  })

  it('returns false after resetConfig is called', () => {
    saveConfig(DEFAULT_CONFIG)
    resetConfig()
    expect(hasStoredConfig()).toBe(false)
  })
})

describe('config withdrawal_priority and drawdown stage normalization', () => {
  beforeEach(() => { localStorage.clear() })

  it('uses one blended drawdown stage for a fresh/default config', () => {
    expect(DEFAULT_CONFIG.drawdown_stages).toEqual([
      {
        id: 'stage_1',
        sources: [
          { source_type: 'dc_pot', source_name: 'DC Pension', target_share: 0.5 },
          { source_type: 'tax_free_account', source_name: 'ISA', target_share: 0.5 },
        ],
      },
    ])
    expect(loadConfig().drawdown_stages).toEqual(DEFAULT_CONFIG.drawdown_stages)
    expect(resetConfig().drawdown_stages).toEqual(DEFAULT_CONFIG.drawdown_stages)
  })

  it('repairs saved configs that contain only empty drawdown stage drafts', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'DC Pension'],
      drawdown_stages: [
        { id: 'stage_1', sources: [] },
        { id: 'stage_2', sources: [] },
        { id: 'stage_3', sources: [] },
      ],
    }))

    expect(loadConfig().drawdown_stages).toEqual([
      {
        id: 'legacy_stage_1',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
      {
        id: 'legacy_stage_2',
        sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
      },
    ])
  })

  it('does not persist transient empty drawdown stage drafts', () => {
    saveConfig({
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['DC Pension', 'ISA'],
      drawdown_stages: [
        { id: 'stage_1', sources: [] },
        { id: 'stage_2', sources: [] },
        { id: 'stage_3', sources: [] },
      ],
    })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).drawdown_stages).toEqual([
      {
        id: 'legacy_stage_1',
        sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
      },
      {
        id: 'legacy_stage_2',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
    ])
  })

  it('repairs malformed stored withdrawal_priority when loading config', () => {
    const storedConfig = {
      ...DEFAULT_CONFIG,
      dc_pots: [
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Main DC' },
        { ...DEFAULT_CONFIG.dc_pots[0]!, name: 'Backup DC' },
      ],
      tax_free_accounts: [
        { ...DEFAULT_CONFIG.tax_free_accounts[0]!, name: 'ISA' },
      ],
      withdrawal_priority: ['Stale Pot', 'ISA', 'ISA', 'Main DC'],
    } as PlannerConfig

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))

    expect(loadConfig().withdrawal_priority).toEqual(['ISA', 'Main DC', 'Backup DC'])
  })

  it('normalizes withdrawal_priority before saving config', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'Missing', 'ISA'],
    }

    saveConfig(cfg)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).withdrawal_priority).toEqual([
      'ISA',
      'DC Pension',
    ])
  })

  it('adds deterministic drawdown stages before saving config-only legacy shapes', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      withdrawal_priority: ['ISA', 'DC Pension'],
      drawdown_stages: undefined,
    } as PlannerConfig

    saveConfig(cfg)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).drawdown_stages).toEqual([
      {
        id: 'legacy_stage_1',
        sources: [{ source_type: 'tax_free_account', source_name: 'ISA', target_share: 1 }],
      },
      {
        id: 'legacy_stage_2',
        sources: [{ source_type: 'dc_pot', source_name: 'DC Pension', target_share: 1 }],
      },
    ])
  })
})


describe('income source normalization', () => {
  beforeEach(() => { localStorage.clear() })

  it('adds income source type and open-ended end date for older saved configs', () => {
    const { income_type: _incomeType, end_date: _endDate, ...legacyIncome } = DEFAULT_CONFIG.guaranteed_income[0]!
    const storedConfig = {
      ...DEFAULT_CONFIG,
      guaranteed_income: [legacyIncome],
    } as unknown as PlannerConfig

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))

    const income = loadConfig().guaranteed_income[0]!
    expect(income.income_type).toBe('state_pension')
    expect(income.end_date).toBeNull()
  })
})


describe('DC pension tax-free cash metadata normalization', () => {
  beforeEach(() => { localStorage.clear() })

  it('adds default gradual pro-rata metadata when loading older saved configs', () => {
    const { tax_free_cash: _taxFreeCash, ...legacyPot } = DEFAULT_CONFIG.dc_pots[0]!
    const storedConfig = {
      ...DEFAULT_CONFIG,
      dc_pots: [legacyPot],
    } as unknown as PlannerConfig

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))

    expect(loadConfig().dc_pots[0]!.tax_free_cash).toEqual({
      mode: 'gradual_pro_rata',
      residual_mode: 'gradual_pro_rata',
    })
  })

  it('persists default gradual pro-rata metadata for config-only saves', () => {
    const { tax_free_cash: _taxFreeCash, ...legacyPot } = DEFAULT_CONFIG.dc_pots[0]!

    saveConfig({
      ...DEFAULT_CONFIG,
      dc_pots: [legacyPot],
    } as unknown as PlannerConfig)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).dc_pots[0].tax_free_cash).toEqual({
      mode: 'gradual_pro_rata',
      residual_mode: 'gradual_pro_rata',
    })
  })
})


describe('pension access event config normalization', () => {
  beforeEach(() => { localStorage.clear() })

  it('does not add pension access events when loading existing configs', () => {
    const storedConfig = { ...DEFAULT_CONFIG } as PlannerConfig
    delete storedConfig.pension_access_events

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))

    expect(loadConfig().pension_access_events).toBeUndefined()
  })

  it('preserves explicit pension access events when saving config-only files', () => {
    saveConfig({
      ...DEFAULT_CONFIG,
      pension_access_events: [
        {
          id: 'planned_tfc',
          pot_ref: 'DC Pension',
          event_type: 'tax_free_cash',
          timing: { kind: 'date', date: '2032-01' },
          amount: { kind: 'fixed_amount', value: 25000 },
          destination: { kind: 'outside_plan' },
          notes: 'Take separately from ordinary drawdown',
        },
      ],
    })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).pension_access_events).toEqual([
      {
        id: 'planned_tfc',
        pot_ref: 'DC Pension',
        event_type: 'tax_free_cash',
        timing: { kind: 'date', date: '2032-01' },
        amount: { kind: 'fixed_amount', value: 25000 },
        destination: { kind: 'outside_plan' },
        notes: 'Take separately from ordinary drawdown',
      },
    ])
  })

  it('strips malformed non-array pension access event data on load and save', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...DEFAULT_CONFIG,
      pension_access_events: { id: 'not-an-array' },
    }))

    expect(loadConfig().pension_access_events).toBeUndefined()

    saveConfig({
      ...DEFAULT_CONFIG,
      pension_access_events: { id: 'not-an-array' },
    } as unknown as PlannerConfig)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).pension_access_events).toBeUndefined()
  })
})
