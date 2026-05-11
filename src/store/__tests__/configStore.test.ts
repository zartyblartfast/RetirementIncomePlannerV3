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

describe('config withdrawal_priority normalization', () => {
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
})
