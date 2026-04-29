import { describe, it, expect, beforeEach } from 'vitest'
import { hasStoredConfig, saveConfig, resetConfig, DEFAULT_CONFIG } from '../configStore'

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
