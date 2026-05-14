import type { DrawdownStageConfig, DrawdownStageSourceConfig, DrawdownStageTransition } from './types';

const EPSILON = 0.01;

export function hasBlendedDrawdownStages(stages: DrawdownStageConfig[]): boolean {
  return stages.some(stage =>
    stage.sources.length !== 1 || Math.abs((stage.sources[0]?.target_share ?? 0) - 1) > 0.000001,
  );
}

interface AllocateBlendedNetWithdrawalParams {
  stages: DrawdownStageConfig[];
  remainingNet: number;
  month: number;
  recordedTransitionKeys: Set<string>;
  sourceBalance: (source: DrawdownStageSourceConfig) => number;
  withdrawSource: (
    source: DrawdownStageSourceConfig,
    netNeeded: number,
    stage: DrawdownStageConfig,
    stageIndex: number,
  ) => number;
  recordTransition: (transition: DrawdownStageTransition) => void;
}

interface AllocateBlendedGrossWithdrawalParams {
  stages: DrawdownStageConfig[];
  remainingGross: number;
  month: number;
  recordedTransitionKeys: Set<string>;
  sourceBalance: (source: DrawdownStageSourceConfig) => number;
  withdrawSource: (
    source: DrawdownStageSourceConfig,
    grossNeeded: number,
    stage: DrawdownStageConfig,
    stageIndex: number,
  ) => number;
  recordTransition: (transition: DrawdownStageTransition) => void;
}

function stageDisplayName(stage: DrawdownStageConfig, stageIndex: number): string {
  return stage.name?.trim() || `Stage ${stageIndex + 1}`;
}

function recordStageTransition(
  stage: DrawdownStageConfig,
  stageIndex: number,
  nextStage: DrawdownStageConfig | undefined,
  month: number,
  recordedTransitionKeys: Set<string>,
  recordTransition: (transition: DrawdownStageTransition) => void,
): void {
  const transitionKey = `${stage.id}->${nextStage?.id ?? ''}`;
  if (!nextStage || recordedTransitionKeys.has(transitionKey)) return;

  recordedTransitionKeys.add(transitionKey);
  recordTransition({
    month,
    from_stage_id: stage.id,
    from_stage_name: stageDisplayName(stage, stageIndex),
    to_stage_id: nextStage.id,
    to_stage_name: stageDisplayName(nextStage, stageIndex + 1),
    reason: 'stage_depleted',
  });
}

export function allocateBlendedNetWithdrawal(params: AllocateBlendedNetWithdrawalParams): number {
  let remainingNet = params.remainingNet;

  for (let stageIndex = 0; stageIndex < params.stages.length; stageIndex++) {
    const stage = params.stages[stageIndex]!;
    if (remainingNet <= EPSILON) break;

    let stageRemaining = remainingNet;
    let activeSources = stage.sources.filter(source => params.sourceBalance(source) > EPSILON);

    while (stageRemaining > EPSILON && activeSources.length > 0) {
      const roundNeed = stageRemaining;
      const shareTotal = activeSources.reduce((sum, source) => sum + source.target_share, 0);
      let progressed = false;

      for (const source of activeSources) {
        const sourceNeed = roundNeed * (source.target_share / shareTotal);
        const netFromSource = params.withdrawSource(source, sourceNeed, stage, stageIndex);
        if (netFromSource > 0) {
          progressed = true;
          stageRemaining = Math.max(0, stageRemaining - netFromSource);
          remainingNet = Math.max(0, remainingNet - netFromSource);
        }
      }

      activeSources = activeSources.filter(source => params.sourceBalance(source) > EPSILON);
      if (!progressed) break;
    }

    const stageDepleted = stage.sources.every(source => params.sourceBalance(source) <= EPSILON);
    if (stageDepleted) {
      recordStageTransition(
        stage,
        stageIndex,
        params.stages[stageIndex + 1],
        params.month,
        params.recordedTransitionKeys,
        params.recordTransition,
      );
    }
  }

  return remainingNet;
}

export function allocateBlendedGrossWithdrawal(params: AllocateBlendedGrossWithdrawalParams): number {
  let remainingGross = params.remainingGross;

  for (let stageIndex = 0; stageIndex < params.stages.length; stageIndex++) {
    const stage = params.stages[stageIndex]!;
    if (remainingGross <= EPSILON) break;

    let stageRemaining = remainingGross;
    let activeSources = stage.sources.filter(source => params.sourceBalance(source) > EPSILON);

    while (stageRemaining > EPSILON && activeSources.length > 0) {
      const roundNeed = stageRemaining;
      const shareTotal = activeSources.reduce((sum, source) => sum + source.target_share, 0);
      let progressed = false;

      for (const source of activeSources) {
        const sourceNeed = roundNeed * (source.target_share / shareTotal);
        const grossFromSource = params.withdrawSource(source, sourceNeed, stage, stageIndex);
        if (grossFromSource > 0) {
          progressed = true;
          stageRemaining = Math.max(0, stageRemaining - grossFromSource);
          remainingGross = Math.max(0, remainingGross - grossFromSource);
        }
      }

      activeSources = activeSources.filter(source => params.sourceBalance(source) > EPSILON);
      if (!progressed) break;
    }

    const stageDepleted = stage.sources.every(source => params.sourceBalance(source) <= EPSILON);
    if (stageDepleted) {
      recordStageTransition(
        stage,
        stageIndex,
        params.stages[stageIndex + 1],
        params.month,
        params.recordedTransitionKeys,
        params.recordTransition,
      );
    }
  }

  return remainingGross;
}
