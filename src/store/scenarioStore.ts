/**
 * Scenario store — localStorage-backed CRUD for What If scenarios.
 *
 * Each scenario is a named snapshot of a PlannerConfig.
 * Scenarios are independent of the main dashboard config.
 */

import type { PlannerConfig } from '../engine/types';

const STORAGE_KEY = 'rip_v2_scenarios';

// ------------------------------------------------------------------ //
//  Types
// ------------------------------------------------------------------ //

export interface Scenario {
  id: string;
  name: string;
  config: PlannerConfig;
  createdAt: string;   // ISO timestamp
}

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ------------------------------------------------------------------ //
//  Load / save (raw)
// ------------------------------------------------------------------ //

export function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Scenario[];
  } catch {
    // Corrupted — return empty
  }
  return [];
}

function persist(scenarios: Scenario[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

// ------------------------------------------------------------------ //
//  CRUD operations
// ------------------------------------------------------------------ //

export function saveScenario(name: string, config: PlannerConfig): Scenario {
  const scenarios = loadScenarios();

  // Deep-clone config to avoid reference sharing
  const cloned: PlannerConfig = JSON.parse(JSON.stringify(config));

  const scenario: Scenario = {
    id: generateId(),
    name,
    config: cloned,
    createdAt: new Date().toISOString(),
  };

  scenarios.push(scenario);
  persist(scenarios);
  return scenario;
}

export function deleteScenario(id: string): Scenario[] {
  const scenarios = loadScenarios().filter(s => s.id !== id);
  persist(scenarios);
  return scenarios;
}

export function renameScenario(id: string, newName: string): Scenario[] {
  const scenarios = loadScenarios();
  const s = scenarios.find(sc => sc.id === id);
  if (s) s.name = newName;
  persist(scenarios);
  return scenarios;
}

export function updateScenarioConfig(id: string, config: PlannerConfig): Scenario[] {
  const scenarios = loadScenarios();
  const s = scenarios.find(sc => sc.id === id);
  if (s) s.config = JSON.parse(JSON.stringify(config));
  persist(scenarios);
  return scenarios;
}
