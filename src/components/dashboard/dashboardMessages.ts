import type { ProjectionResult } from '../../engine/types';

/** Keep engine warnings intact, but show ordinary pot exhaustion as timeline information. */
export function dashboardMessages(result: ProjectionResult): { warnings: string[]; milestones: string[] } {
  const depletionMessages = new Set(result.summary.depletion_events.map(
    event => `${event.pot} exhausted at age ${event.age} month ${event.month}`,
  ));
  return {
    warnings: result.warnings.filter(message => !depletionMessages.has(message)),
    milestones: result.warnings.filter(message => depletionMessages.has(message)),
  };
}
