/**
 * Review store — localStorage-backed persistence for plan reviews.
 *
 * Stores:
 * - A baseline config (the plan as it was when first locked in)
 * - A chronological list of review snapshots with pot balances and income drawn
 *
 * Reviews are frequency-agnostic: the user reviews whenever they want.
 */

import type { PlannerConfig } from '../engine/types';

const STORAGE_KEY = 'rip_v2_reviews';

// ------------------------------------------------------------------ //
//  Types
// ------------------------------------------------------------------ //

export interface ReviewSnapshot {
  id: string;
  date: string;                                   // "YYYY-MM"
  pot_balances: Record<string, number>;           // pot name → closing balance
  income_since_last: Record<string, number>;      // source name → income drawn since previous review
  guaranteed_monthly: Record<string, number>;     // source → current monthly guaranteed income amount
  strategy: string;                                // active drawdown strategy at review time
  strategy_params: Record<string, number>;         // strategy params at review time
  notes: string;
}

export interface ReviewStore {
  baseline_config: PlannerConfig | null;          // locked at plan start
  baseline_locked_date: string | null;            // ISO date when baseline was set
  reviews: ReviewSnapshot[];                      // chronological
}

// ------------------------------------------------------------------ //
//  Helpers
// ------------------------------------------------------------------ //

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptyStore(): ReviewStore {
  return {
    baseline_config: null,
    baseline_locked_date: null,
    reviews: [],
  };
}

// ------------------------------------------------------------------ //
//  Load / save (raw)
// ------------------------------------------------------------------ //

export function loadReviewStore(): ReviewStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ReviewStore;
  } catch {
    // Corrupted — return empty
  }
  return emptyStore();
}

function persist(store: ReviewStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ------------------------------------------------------------------ //
//  Baseline operations
// ------------------------------------------------------------------ //

export function lockBaseline(config: PlannerConfig): ReviewStore {
  const store = loadReviewStore();
  store.baseline_config = JSON.parse(JSON.stringify(config));
  store.baseline_locked_date = new Date().toISOString();
  persist(store);
  return store;
}

export function clearBaseline(): ReviewStore {
  const store = loadReviewStore();
  store.baseline_config = null;
  store.baseline_locked_date = null;
  persist(store);
  return store;
}

// ------------------------------------------------------------------ //
//  Review CRUD
// ------------------------------------------------------------------ //

export function addReview(snapshot: Omit<ReviewSnapshot, 'id'>): ReviewStore {
  const store = loadReviewStore();
  const review: ReviewSnapshot = {
    ...snapshot,
    id: generateId(),
  };
  store.reviews.push(review);
  // Keep sorted by date
  store.reviews.sort((a, b) => a.date.localeCompare(b.date));
  persist(store);
  return store;
}

export function updateReview(id: string, updates: Partial<Omit<ReviewSnapshot, 'id'>>): ReviewStore {
  const store = loadReviewStore();
  const review = store.reviews.find(r => r.id === id);
  if (review) {
    Object.assign(review, updates);
    store.reviews.sort((a, b) => a.date.localeCompare(b.date));
  }
  persist(store);
  return store;
}

export function deleteReview(id: string): ReviewStore {
  const store = loadReviewStore();
  store.reviews = store.reviews.filter(r => r.id !== id);
  persist(store);
  return store;
}

export function getLatestReview(store: ReviewStore): ReviewSnapshot | null {
  return store.reviews.length > 0 ? store.reviews[store.reviews.length - 1]! : null;
}

/**
 * Compute months elapsed since the last review (or since baseline lock if no reviews).
 * Returns null if no baseline and no reviews exist.
 */
export function monthsSinceLastReview(store: ReviewStore): number | null {
  const latest = getLatestReview(store);
  let refDate: string | null = null;
  if (latest) {
    refDate = latest.date;
  } else if (store.baseline_locked_date) {
    refDate = store.baseline_locked_date.slice(0, 7); // ISO → YYYY-MM
  }
  if (!refDate) return null;

  const [ry, rm] = refDate.split('-').map(Number) as [number, number];
  const now = new Date();
  const ny = now.getFullYear();
  const nm = now.getMonth() + 1;
  return (ny - ry) * 12 + (nm - rm);
}
