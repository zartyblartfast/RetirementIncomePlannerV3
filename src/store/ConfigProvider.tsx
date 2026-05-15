/**
 * ConfigProvider — wraps the app and provides config state + persistence.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { ConfigContext, loadConfig, saveConfig, resetConfig, hasStoredConfig } from './configStore';
import type { PlannerConfig } from '../engine/types';
import { normalizeConfigDrawdownStages } from '../engine/drawdownStages';
import { normalizeConfigWithdrawalPriority } from '../engine/withdrawalPriority';

export default function ConfigProvider({ children }: { children: ReactNode }) {
  const [isFirstVisit, setIsFirstVisit] = useState<boolean>(() => !hasStoredConfig());
  const [config, setConfigState] = useState<PlannerConfig>(() => loadConfig());

  const setConfig = useCallback((cfg: PlannerConfig) => {
    const normalizedPriority = normalizeConfigWithdrawalPriority(JSON.parse(JSON.stringify(cfg)) as PlannerConfig);
    const next = normalizeConfigDrawdownStages(normalizedPriority, { repairEmptyStages: true });
    setConfigState(next);
    saveConfig(next);
  }, []);

  const updateConfig = useCallback((updater: (prev: PlannerConfig) => PlannerConfig) => {
    setConfigState(prev => {
      const normalizedPriority = normalizeConfigWithdrawalPriority(updater(prev));
      const next = normalizeConfigDrawdownStages(normalizedPriority);
      saveConfig(next);
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    const def = resetConfig();
    setConfigState(def);
    setIsFirstVisit(true);
  }, []);

  const markConfigured = useCallback(() => {
    setIsFirstVisit(false);
  }, []);

  return (
    <ConfigContext.Provider value={{
      config, setConfig, updateConfig, resetToDefault,
      isFirstVisit, markConfigured,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}
