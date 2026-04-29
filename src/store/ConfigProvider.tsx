/**
 * ConfigProvider — wraps the app and provides config state + persistence.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { ConfigContext, loadConfig, saveConfig, resetConfig, hasStoredConfig } from './configStore';
import type { PlannerConfig } from '../engine/types';

export default function ConfigProvider({ children }: { children: ReactNode }) {
  const [isFirstVisit, setIsFirstVisit] = useState<boolean>(() => !hasStoredConfig());
  const [config, setConfigState] = useState<PlannerConfig>(() => loadConfig());

  const setConfig = useCallback((cfg: PlannerConfig) => {
    setConfigState(cfg);
    saveConfig(cfg);
  }, []);

  const updateConfig = useCallback((updater: (prev: PlannerConfig) => PlannerConfig) => {
    setConfigState(prev => {
      const next = updater(prev);
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
