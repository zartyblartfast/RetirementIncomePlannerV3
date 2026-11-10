import type { ProjectionSummary } from '../../engine/types';

/** Copy for the projected comparison, not a claim of guaranteed future income. */
export function dashboardOutcome(summary: ProjectionSummary, isPortfolioDriven: boolean): {
  headline: string;
  explanation: string;
  needsAttention: boolean;
} {
  const comparison = isPortfolioDriven ? 'strategy-derived spending estimate' : 'income target';
  if (summary.num_years === 0) {
    return {
      headline: 'No projection available yet',
      explanation: 'Check your plan inputs to see an income projection.',
      needsAttention: true,
    };
  }
  if (summary.first_shortfall_age !== null) {
    return {
      headline: `Projected income first falls short at age ${summary.first_shortfall_age}`,
      explanation: `Compared with your ${comparison} through age ${summary.end_age}. This is a modelled result, not a guarantee.`,
      needsAttention: true,
    };
  }
  if (isPortfolioDriven) {
    return {
      headline: `Projection follows the strategy spending rule through age ${summary.end_age}`,
      explanation: 'Compared with the strategy-derived spending estimate, not the separate planning benchmark. Future income is not guaranteed.',
      needsAttention: false,
    };
  }
  return {
    headline: `Projected income meets the ${comparison} through age ${summary.end_age}`,
    explanation: 'Based on the current assumptions; future income is not guaranteed.',
    needsAttention: false,
  };
}
