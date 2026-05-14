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
