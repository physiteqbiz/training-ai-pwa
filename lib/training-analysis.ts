import {
  calculateEstimated1RM,
  formatWeight,
  kgToDisplayWeight,
  normalizeWeightUnit,
  type WeightUnit
} from "@/lib/weight-unit";

export type SetType = "normal" | "warmup" | "main" | "backoff" | "drop";

export type TrendLabel =
  | "improving"
  | "slightly_improving"
  | "stable"
  | "slightly_declining"
  | "declining"
  | "insufficient_data";

export type WorkoutSetForAnalysis = {
  session_id?: string;
  exercise_name: string;
  weight: number | string;
  reps: number | string;
  set_order: number | string;
  exercise_order?: number | string | null;
  set_type?: string | null;
  is_assisted?: boolean | null;
  set_memo?: string | null;
  created_at?: string;
};

export type PreviousSessionForAnalysis = {
  id: string;
  session_date: string;
  created_at: string;
  workout_sets: WorkoutSetForAnalysis[];
};

export type NormalizedTrainingSet = {
  exercise_name: string;
  weight: number;
  reps: number;
  set_order: number;
  exercise_order: number;
  declared_set_type: SetType;
  effective_set_type: SetType;
  is_assisted: boolean;
  set_memo: string | null;
  estimated_1rm: number;
  rm_eligible: boolean;
  rm_exclusion_reason: string | null;
  classification_note: string | null;
};

export type TargetLine = {
  weight: number;
  weight_kg: number;
  display_weight: number;
  display_unit: WeightUnit;
  reps: string;
  sets: string;
  note: string;
  text: string;
  candidate_e1rm: number;
  candidate_e1rm_display: number;
  candidate_e1rm_ratio: number | null;
  candidate_e1rm_limit: number;
  candidate_e1rm_limit_display: number;
  candidate_reps_for_e1rm: number;
  candidate_e1rm_check: "within_limit" | "adjusted_to_limit";
};

export type SuggestedTargets = {
  strength_target: TargetLine[];
  hypertrophy_target: TargetLine[];
  fatigue_management_target: TargetLine[];
  priority_target: "strength_target" | "hypertrophy_target" | "fatigue_management_target";
};

export type ExerciseAnalysis = {
  exercise_name: string;
  set_count: number;
  total_reps: number;
  total_volume: number;
  max_weight: number;
  max_weight_display: number;
  weight_unit: WeightUnit;
  best_set: {
    weight: number;
    display_weight: number;
    display_unit: WeightUnit;
    reps: number;
    estimated_1rm: number;
    estimated_1rm_display: number;
    set_type: SetType;
    is_assisted: boolean;
  };
  top_single: {
    weight: number;
    display_weight: number;
    display_unit: WeightUnit;
    reps: 1;
    estimated_1rm: number;
    estimated_1rm_display: number;
    set_type: SetType;
    set_order: number;
  } | null;
  top_set: {
    weight: number;
    display_weight: number;
    display_unit: WeightUnit;
    reps: number;
    estimated_1rm: number;
    estimated_1rm_display: number;
    set_type: SetType;
    set_order: number;
    is_assisted: boolean;
  } | null;
  top_set_estimated_1rm_kg: number | null;
  top_set_notes: string | null;
  main_set: {
    weight: number;
    display_weight: number;
    display_unit: WeightUnit;
    reps: number;
    estimated_1rm: number;
    estimated_1rm_display: number;
    set_type: SetType;
    set_order: number;
    is_assisted: boolean;
  } | null;
  sets: Array<{
    weight: number;
    display_weight: number;
    display_unit: WeightUnit;
    reps: number;
    set_order: number;
    set_type: SetType;
    declared_set_type: SetType;
    is_assisted: boolean;
    set_memo: string | null;
    estimated_1rm: number;
    rm_eligible: boolean;
  }>;
  set_type_counts: Record<SetType, number>;
  assisted_set_count: number;
  rm_eligible_sets: NormalizedTrainingSet[];
  rm_excluded_sets: Array<NormalizedTrainingSet & { rm_exclusion_reason: string }>;
  best_rm_eligible_set: NormalizedTrainingSet | null;
  estimated_1rm_from_rm_eligible_sets: number | null;
  estimated_1rm_from_rm_eligible_sets_display: number | null;
  working_set_count: number;
  working_total_reps: number;
  working_total_volume: number;
  backoff_total_volume: number;
  same_weight_repetition_quality: {
    weight: number | null;
    set_count: number;
    max_reps: number | null;
    min_reps: number | null;
    label: "none" | "single" | "consistent" | "variable" | "fatigue_drop";
  };
  repeated_main_performance: {
    weight: number | null;
    display_weight: number | null;
    display_unit: WeightUnit;
    set_count: number;
    max_reps: number | null;
    min_reps: number | null;
    label: "none" | "single" | "consistent" | "variable" | "fatigue_drop";
    note: string;
  };
  fatigue_drop: {
    label: "none" | "stable" | "mild" | "notable";
    reps_drop: number;
    note: string;
  };
  set_classification_notes: string[];
  suggested_targets: SuggestedTargets;
  guardrail_notes: string[];
  max_weight_bodyweight_ratio?: number;
  estimated_1rm_bodyweight_ratio?: number;
};

export type PreviousExerciseAnalysis = {
  previous_sessions: Array<
    ExerciseAnalysis & {
      session_id: string;
      session_date: string;
    }
  >;
  previous_main_set: ExerciseAnalysis["main_set"] | null;
  previous_repeated_main_performance: ExerciseAnalysis["repeated_main_performance"] | null;
  previous_best_set: ExerciseAnalysis["best_rm_eligible_set"] | null;
  previous_estimated_1rm: number | null;
  previous_total_volume: number | null;
  previous_total_sets: number | null;
  previous_total_reps: number | null;
  trend_last_3_sessions: TrendLabel;
};

type AnalysisOptions = {
  bodyWeightKg?: number;
  primaryGoal?: string | null;
  secondaryGoal?: string | null;
  weightUnit?: WeightUnit | string | null;
};

export type CurrentTrainingAnalysis = {
  exercise_count: number;
  total_sets: number;
  total_reps: number;
  total_volume: number;
  main_exercises: string[];
  accessory_exercises: string[];
  exercises_summary: ExerciseAnalysis[];
};

export const setTypeLabels: Record<SetType, string> = {
  normal: "通常",
  warmup: "アップ",
  main: "メイン",
  backoff: "バックオフ",
  drop: "ドロップ"
};

const setTypes = new Set<SetType>(["normal", "warmup", "main", "backoff", "drop"]);

export function isSetType(value: unknown): value is SetType {
  return typeof value === "string" && setTypes.has(value as SetType);
}

export function normalizeSetType(value: unknown): SetType {
  return isSetType(value) ? value : "normal";
}

export function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundThree(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundToIncrement(value: number, increment = 2.5) {
  return roundOne(Math.round(value / increment) * increment);
}

function floorToIncrement(value: number, increment = 2.5) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value < increment) {
    return roundOne(value);
  }

  return roundOne(Math.floor(value / increment) * increment);
}

type TargetE1RmMetadata = {
  candidate_e1rm: number;
  candidate_e1rm_display: number;
  candidate_e1rm_ratio: number | null;
  candidate_e1rm_limit: number;
  candidate_e1rm_limit_display: number;
  candidate_reps_for_e1rm: number;
  candidate_e1rm_check: "within_limit" | "adjusted_to_limit";
};

function formatTarget(
  weightKg: number,
  reps: string,
  sets: string,
  note: string,
  weightUnit: WeightUnit,
  e1rmMetadata: TargetE1RmMetadata
): TargetLine {
  const displayWeight = kgToDisplayWeight(weightKg, weightUnit);

  return {
    weight: displayWeight,
    weight_kg: weightKg,
    display_weight: displayWeight,
    display_unit: weightUnit,
    reps,
    sets,
    note,
    text: `${formatWeight(weightKg, weightUnit)} × ${reps}回 × ${sets}セット`,
    ...e1rmMetadata
  };
}

export function estimateOneRepMax(weight: number, reps: number) {
  return roundOne(calculateEstimated1RM(weight, reps) ?? 0);
}

export function normalizeTrainingSet(set: WorkoutSetForAnalysis): NormalizedTrainingSet {
  const weight = Number(set.weight);
  const reps = Number(set.reps);

  return {
    exercise_name: set.exercise_name,
    weight: Number.isFinite(weight) ? weight : 0,
    reps: Number.isFinite(reps) ? reps : 0,
    set_order: Number(set.set_order),
    exercise_order: Number(set.exercise_order ?? 0),
    declared_set_type: normalizeSetType(set.set_type),
    effective_set_type: normalizeSetType(set.set_type),
    is_assisted: Boolean(set.is_assisted),
    set_memo: set.set_memo?.trim() ? set.set_memo.trim() : null,
    estimated_1rm: estimateOneRepMax(Number.isFinite(weight) ? weight : 0, Number.isFinite(reps) ? reps : 0),
    rm_eligible: false,
    rm_exclusion_reason: null,
    classification_note: null
  };
}

function classifyExerciseSets(sets: NormalizedTrainingSet[]) {
  const sortedSets = sets.slice().sort((a, b) => a.set_order - b.set_order);
  const maxWeight = sortedSets.reduce((max, set) => Math.max(max, set.weight), 0);
  const topThreshold = maxWeight * 0.9;
  const firstTopIndex = sortedSets.findIndex((set) => set.weight >= topThreshold);
  let highestSeen = 0;

  return sortedSets.map((set, index) => {
    let effectiveSetType = set.declared_set_type;
    let classificationNote: string | null = null;

    if (set.declared_set_type === "normal" && maxWeight > 0) {
      if (firstTopIndex > index && set.weight <= maxWeight * 0.88) {
        effectiveSetType = "warmup";
        classificationNote = "通常セットとして入力されていますが、最大重量前の軽いセットのためアップ扱いで評価します。";
      } else if (index > firstTopIndex && highestSeen > 0 && set.weight <= highestSeen * 0.9 && set.weight < maxWeight) {
        effectiveSetType = "backoff";
        classificationNote = "通常セットとして入力されていますが、高重量後の重量調整セットのためバックオフ扱いで評価します。";
      }
    }

    highestSeen = Math.max(highestSeen, set.weight);

    let rmEligible = false;
    let rmExclusionReason: string | null = null;

    if (set.is_assisted) {
      rmExclusionReason = "補助ありセットのため主要RM評価から除外";
    } else if (effectiveSetType === "warmup") {
      rmExclusionReason = "アップセットのため主要RM評価から除外";
    } else if (effectiveSetType === "drop") {
      rmExclusionReason = "ドロップセットのため主要RM評価から除外";
    } else if (effectiveSetType === "backoff") {
      rmExclusionReason = "バックオフセットのためRM評価では参考扱い";
    } else {
      rmEligible = set.weight > 0 && set.reps > 0;
    }

    return {
      ...set,
      effective_set_type: effectiveSetType,
      classification_note: classificationNote,
      rm_eligible: rmEligible,
      rm_exclusion_reason: rmExclusionReason
    };
  });
}

function getBestSet(sets: NormalizedTrainingSet[]) {
  return sets
    .slice()
    .sort((a, b) => b.estimated_1rm - a.estimated_1rm || b.weight - a.weight || b.reps - a.reps)[0];
}

function getTopSet(sets: NormalizedTrainingSet[]) {
  const topSetCandidates = sets.filter((set) => set.rm_eligible && set.reps >= 1 && set.reps <= 3);

  if (!topSetCandidates.length) {
    return null;
  }

  const maxTopSetWeight = topSetCandidates.reduce((max, set) => Math.max(max, set.weight), 0);

  return topSetCandidates
    .filter((set) => set.weight >= maxTopSetWeight * 0.95)
    .sort((a, b) => b.weight - a.weight || b.reps - a.reps || b.estimated_1rm - a.estimated_1rm || a.set_order - b.set_order)[0] ?? null;
}

function getTopSetNotes(
  exerciseName: string,
  topSet: NormalizedTrainingSet | null,
  mainSet: NormalizedTrainingSet | null,
  displayUnit: WeightUnit
) {
  if (!topSet) {
    return `${exerciseName}: top_set_notes: 1〜3回の高重量トップセットは特定できません。`;
  }

  const topSetText = `${formatWeight(topSet.weight, displayUnit)}×${topSet.reps}回`;
  const mainSetText = mainSet
    ? `${formatWeight(mainSet.weight, displayUnit)}×${mainSet.reps}回`
    : "なし";
  const e1RmText = formatWeight(topSet.estimated_1rm, displayUnit);

  if (mainSet && topSet.weight !== mainSet.weight) {
    return `${exerciseName}: top_set_notes: ${topSetText}を1〜3回の高重量トップセットとして評価します。推定1RM最高値がmain_set=${mainSetText}由来でも、top_set=${topSetText}の高重量帯出力を無視しません。top_set_e1RM=${e1RmText}。`;
  }

  return `${exerciseName}: top_set_notes: ${topSetText}をその日の高重量トップセットとして評価します。top_set_e1RM=${e1RmText}。`;
}

function getSameWeightQuality(workingSets: NormalizedTrainingSet[]) {
  if (workingSets.length === 0) {
    return { weight: null, set_count: 0, max_reps: null, min_reps: null, label: "none" as const };
  }

  const groups = new Map<number, NormalizedTrainingSet[]>();

  for (const set of workingSets) {
    groups.set(set.weight, [...(groups.get(set.weight) ?? []), set]);
  }

  const [weight, sets] = Array.from(groups.entries()).sort((a, b) => b[0] - a[0])[0];
  const reps = sets.map((set) => set.reps);
  const maxReps = Math.max(...reps);
  const minReps = Math.min(...reps);

  if (sets.length === 1) {
    return { weight, set_count: 1, max_reps: maxReps, min_reps: minReps, label: "single" as const };
  }

  const first = sets[0]?.reps ?? maxReps;
  const last = sets[sets.length - 1]?.reps ?? minReps;
  const drop = first - last;

  return {
    weight,
    set_count: sets.length,
    max_reps: maxReps,
    min_reps: minReps,
    label: drop >= 2 ? ("fatigue_drop" as const) : maxReps - minReps <= 1 ? ("consistent" as const) : ("variable" as const)
  };
}

function getFatigueDrop(workingSets: NormalizedTrainingSet[]) {
  const quality = getSameWeightQuality(workingSets);

  if (!quality.weight || quality.set_count < 2 || quality.max_reps === null || quality.min_reps === null) {
    return { label: "none" as const, reps_drop: 0, note: "同重量の複数セットが少ないため疲労低下は判定しません。" };
  }

  const repsDrop = quality.max_reps - quality.min_reps;

  if (repsDrop >= 3) {
    return { label: "notable" as const, reps_drop: repsDrop, note: "同重量内で回数低下が大きく、疲労影響を考慮します。" };
  }

  if (repsDrop >= 2) {
    return { label: "mild" as const, reps_drop: repsDrop, note: "同重量内で軽い回数低下があります。" };
  }

  return { label: "stable" as const, reps_drop: repsDrop, note: "同重量セットの再現性は安定しています。" };
}

function getPriorityTarget(primaryGoal?: string | null, secondaryGoal?: string | null): SuggestedTargets["priority_target"] {
  const goal = primaryGoal || secondaryGoal;

  if (goal === "strength") {
    return "strength_target";
  }

  if (goal === "hypertrophy" || goal === "body_make" || goal === "contest") {
    return "hypertrophy_target";
  }

  if (goal === "fat_loss" || goal === "health" || goal === "maintenance") {
    return "fatigue_management_target";
  }

  return "hypertrophy_target";
}

type TargetCategory = "strength_target" | "hypertrophy_target" | "fatigue_management_target";

const targetCategoryLabels: Record<TargetCategory, string> = {
  strength_target: "筋力アップ優先",
  hypertrophy_target: "筋肥大優先",
  fatigue_management_target: "疲労管理"
};

function formatRepRange(minReps: number, maxReps: number) {
  return minReps === maxReps ? String(maxReps) : `${minReps}〜${maxReps}`;
}

function maxWeightForCandidateE1Rm(maxAllowedE1Rm: number, maxReps: number) {
  if (maxReps <= 1) {
    return maxAllowedE1Rm;
  }

  return maxAllowedE1Rm / (1 + maxReps / 30);
}

function calculateCandidateE1Rm(weightKg: number, maxReps: number) {
  if (maxReps <= 1) {
    return weightKg;
  }

  return weightKg * (1 + maxReps / 30);
}

function buildCappedTarget(
  draft: {
    category: TargetCategory;
    weightKg: number;
    minReps: number;
    maxReps: number;
    sets: string;
    note: string;
    capRatio: number;
  },
  estimatedOneRepMaxKg: number,
  weightUnit: WeightUnit,
  adjustmentNotes: string[]
) {
  const maxAllowedE1Rm = estimatedOneRepMaxKg * draft.capRatio;
  const maxAllowedWeight = floorToIncrement(
    Math.min(draft.weightKg, maxWeightForCandidateE1Rm(maxAllowedE1Rm, draft.maxReps))
  );
  const targetWeight = maxAllowedWeight > 0 ? maxAllowedWeight : draft.weightKg;
  const proposedE1Rm = estimateOneRepMax(draft.weightKg, draft.maxReps);
  const candidateE1Rm = estimateOneRepMax(targetWeight, draft.maxReps);
  const wasAdjusted = targetWeight < draft.weightKg;
  const reps = formatRepRange(draft.minReps, draft.maxReps);

  if (wasAdjusted) {
    adjustmentNotes.push(
      `${targetCategoryLabels[draft.category]} ${formatWeight(draft.weightKg, weightUnit)}×${reps}回 は候補e1RM ${formatWeight(proposedE1Rm, weightUnit)} が上限 ${formatWeight(maxAllowedE1Rm, weightUnit)} を超えるため ${formatWeight(targetWeight, weightUnit)} に補正。`
    );
  }

  return formatTarget(
    targetWeight,
    reps,
    draft.sets,
    draft.note,
    weightUnit,
    {
      candidate_e1rm: candidateE1Rm,
      candidate_e1rm_display: kgToDisplayWeight(candidateE1Rm, weightUnit),
      candidate_e1rm_ratio: estimatedOneRepMaxKg > 0
        ? roundThree(candidateE1Rm / estimatedOneRepMaxKg)
        : null,
      candidate_e1rm_limit: roundOne(maxAllowedE1Rm),
      candidate_e1rm_limit_display: kgToDisplayWeight(maxAllowedE1Rm, weightUnit),
      candidate_reps_for_e1rm: draft.maxReps,
      candidate_e1rm_check: wasAdjusted ? "adjusted_to_limit" : "within_limit"
    }
  );
}

function getSetSummary(set: NormalizedTrainingSet | null, displayUnit: WeightUnit) {
  if (!set) {
    return null;
  }

  return {
    weight: set.weight,
    display_weight: kgToDisplayWeight(set.weight, displayUnit),
    display_unit: displayUnit,
    reps: set.reps,
    estimated_1rm: set.estimated_1rm,
    estimated_1rm_display: kgToDisplayWeight(set.estimated_1rm, displayUnit),
    set_type: set.effective_set_type,
    set_order: set.set_order,
    is_assisted: set.is_assisted
  };
}

function getRepeatedMainPerformance(
  workingSets: NormalizedTrainingSet[],
  mainSet: NormalizedTrainingSet | null,
  displayUnit: WeightUnit
): ExerciseAnalysis["repeated_main_performance"] {
  if (!mainSet) {
    return {
      weight: null,
      display_weight: null,
      display_unit: displayUnit,
      set_count: 0,
      max_reps: null,
      min_reps: null,
      label: "none",
      note: "メインセットを特定できないため、同重量の再現性は判定しません。"
    };
  }

  const sameWeightSets = workingSets.filter((set) => set.weight === mainSet.weight);
  const reps = sameWeightSets.map((set) => set.reps);
  const maxReps = reps.length ? Math.max(...reps) : mainSet.reps;
  const minReps = reps.length ? Math.min(...reps) : mainSet.reps;
  const first = sameWeightSets[0]?.reps ?? mainSet.reps;
  const last = sameWeightSets[sameWeightSets.length - 1]?.reps ?? mainSet.reps;
  const label =
    sameWeightSets.length <= 1
      ? ("single" as const)
      : first - last >= 2
        ? ("fatigue_drop" as const)
        : maxReps - minReps <= 1
          ? ("consistent" as const)
          : ("variable" as const);
  const note =
    sameWeightSets.length <= 1
      ? "メイン重量は1セットのみのため、再現性は追加データ待ちです。"
      : label === "consistent"
        ? "メイン重量を複数セットで再現できています。"
        : label === "fatigue_drop"
          ? "メイン重量内で後半の回数低下が大きく、疲労影響を考慮します。"
          : "メイン重量内の回数差があり、次回は再現性を確認します。";

  return {
    weight: mainSet.weight,
    display_weight: kgToDisplayWeight(mainSet.weight, displayUnit),
    display_unit: displayUnit,
    set_count: sameWeightSets.length,
    max_reps: maxReps,
    min_reps: minReps,
    label,
    note
  };
}

function buildSuggestedTargets(
  exerciseName: string,
  analysisBase: {
    bestRmEligibleSet: NormalizedTrainingSet | null;
    bestSet: NormalizedTrainingSet | null;
    topSingleSet: NormalizedTrainingSet | null;
    topSet: NormalizedTrainingSet | null;
    workingSetCount: number;
    workingSets: NormalizedTrainingSet[];
    assistedSetCount: number;
  },
  primaryGoal?: string | null,
  secondaryGoal?: string | null,
  weightUnitValue?: WeightUnit | string | null
): { suggestedTargets: SuggestedTargets; guardrailNotes: string[] } {
  const representative = analysisBase.bestRmEligibleSet ?? analysisBase.bestSet;
  const guardrailNotes: string[] = [];
  const weightUnit = normalizeWeightUnit(weightUnitValue);
  const e1RmAdjustmentNotes: string[] = [];

  if (!representative) {
    const emptyTargets: SuggestedTargets = {
      strength_target: [],
      hypertrophy_target: [],
      fatigue_management_target: [],
      priority_target: getPriorityTarget(primaryGoal, secondaryGoal)
    };
    return { suggestedTargets: emptyTargets, guardrailNotes: [`${exerciseName}: 有効なセットがないため次回候補を作成しません。`] };
  }

  if (!analysisBase.bestRmEligibleSet) {
    guardrailNotes.push(`${exerciseName}: 補助あり、アップ、ドロップ等が中心のため、次回候補は控えめに作成します。`);
  }

  if (analysisBase.assistedSetCount > 0) {
    guardrailNotes.push(`${exerciseName}: 補助ありセットは補助なしの実力値として過大評価しません。`);
  }

  const estimatedOneRepMaxKg = representative.estimated_1rm;
  const topWeight = representative.weight;
  const topReps = Math.max(1, representative.reps);
  const workingSetCount = Math.max(1, analysisBase.workingSetCount);
  const strengthCapRatio = 1.03;
  const hypertrophyCapRatio = 1.01;
  const fatigueCapRatio = 0.975;
  const nextSmallJump = topWeight >= 60 && topReps >= 8 && analysisBase.bestRmEligibleSet
    ? roundToIncrement(topWeight + 2.5)
    : topWeight;
  const strengthWeight = Math.min(nextSmallJump, roundToIncrement(topWeight * 1.035));
  const proposedStrengthMaxReps = strengthWeight > topWeight ? topReps : topReps + 1;
  const strengthMaxReps =
    topReps <= 1 || calculateCandidateE1Rm(strengthWeight, proposedStrengthMaxReps) > estimatedOneRepMaxKg * strengthCapRatio
      ? topReps
      : proposedStrengthMaxReps;
  const strengthMinReps = strengthWeight > topWeight
    ? Math.max(1, topReps - 1)
    : topReps;
  const secondarySets = Math.max(1, Math.min(2, workingSetCount - 1));
  const backoffWeight = Math.max(0, roundToIncrement(topWeight * 0.95));
  const repeatedMainSetCount = analysisBase.workingSets.filter((set) => set.weight === topWeight).length;
  const strengthMainSets = repeatedMainSetCount >= 2
    ? String(Math.min(repeatedMainSetCount, 3))
    : "1〜2";
  const strengthBackoffSets = repeatedMainSetCount >= 2
    ? "1〜2"
    : String(Math.max(1, secondarySets));
  const topSetCandidate =
    analysisBase.topSet &&
    (
      analysisBase.topSet.weight > topWeight ||
      (analysisBase.topSet.weight === topWeight && analysisBase.topSet.reps < topReps)
    )
      ? analysisBase.topSet
      : analysisBase.topSingleSet && analysisBase.topSingleSet.weight > topWeight
        ? analysisBase.topSingleSet
        : null;
  const topSetMaxReps =
    topSetCandidate?.reps === 1 &&
    calculateCandidateE1Rm(topSetCandidate.weight, 2) <= estimatedOneRepMaxKg * strengthCapRatio
      ? 2
      : Math.max(1, topSetCandidate?.reps ?? 1);
  const topSetMinReps =
    topSetCandidate?.reps === 1 ? 1 : Math.max(1, topSetCandidate?.reps ?? 1);
  const hypertrophyMinSets = 2;
  const hypertrophyMaxSets = Math.max(hypertrophyMinSets, Math.min(workingSetCount, 3));
  const fatigueSets = Math.max(1, Math.min(workingSetCount, 3));
  const hypertrophyRanges = [
    { min: Math.max(5, topReps + 1), max: Math.max(7, topReps + 3), weight: roundToIncrement(topWeight * 0.925), sets: formatRepRange(hypertrophyMinSets, hypertrophyMaxSets) },
    { min: Math.max(6, topReps + 2), max: Math.max(8, topReps + 4), weight: roundToIncrement(topWeight * 0.9), sets: formatRepRange(hypertrophyMinSets, hypertrophyMaxSets) },
    { min: Math.max(8, topReps + 4), max: Math.max(10, topReps + 6), weight: roundToIncrement(topWeight * 0.85), sets: "1〜2" }
  ];
  const fatigueRanges = [
    { min: Math.max(1, topReps - 1), max: Math.max(1, topReps - 1), weight: topWeight, sets: "1" },
    { min: topReps, max: topReps + 1, weight: backoffWeight, sets: String(Math.max(1, Math.min(2, fatigueSets))) },
    { min: topReps + 1, max: topReps + 2, weight: roundToIncrement(topWeight * 0.9), sets: "1〜2" }
  ];
  const strengthTargetDrafts = [
    ...(topSetCandidate
      ? [
          {
            category: "strength_target" as const,
            weightKg: topSetCandidate.weight,
            minReps: topSetMinReps,
            maxReps: topSetMaxReps,
            sets: "1",
            note: topSetCandidate.reps === 1
              ? "トップシングル。高重量の感覚を確認し、無理に高回数化しません。"
              : "トップセット。今回できた高重量帯の回数を再現し、無理に高回数化しません。",
            capRatio: strengthCapRatio
          }
        ]
      : []),
    {
      category: "strength_target" as const,
      weightKg: strengthWeight,
      minReps: strengthMinReps,
      maxReps: strengthMaxReps,
      sets: strengthMainSets,
      note: topSetCandidate
        ? "今回再現できたメイン重量帯を次回も主軸にします。"
        : "トップセット。無理に更新せず、フォームが崩れるなら据え置きます。",
      capRatio: strengthCapRatio
    },
    {
      category: "strength_target" as const,
      weightKg: backoffWeight,
      minReps: topReps,
      maxReps: topReps + (topReps <= 1 ? 0 : 1),
      sets: strengthBackoffSets,
      note: "メイン後に高重量の再現性を補うバックオフ候補。",
      capRatio: strengthCapRatio
    }
  ];

  const suggestedTargets: SuggestedTargets = {
    strength_target: strengthTargetDrafts.map((draft) =>
      buildCappedTarget(draft, estimatedOneRepMaxKg, weightUnit, e1RmAdjustmentNotes)
    ),
    hypertrophy_target: [
      buildCappedTarget(
        {
          category: "hypertrophy_target",
          weightKg: hypertrophyRanges[0].weight,
          minReps: hypertrophyRanges[0].min,
          maxReps: hypertrophyRanges[0].max,
          sets: hypertrophyRanges[0].sets,
          note: "メイン重量から少し下げ、反復性能と総ボリュームを狙います。",
          capRatio: hypertrophyCapRatio
        },
        estimatedOneRepMaxKg,
        weightUnit,
        e1RmAdjustmentNotes
      ),
      buildCappedTarget(
        {
          category: "hypertrophy_target",
          weightKg: hypertrophyRanges[1].weight,
          minReps: hypertrophyRanges[1].min,
          maxReps: hypertrophyRanges[1].max,
          sets: hypertrophyRanges[1].sets,
          note: "高回数でも推定1RMを大きく超えない重量に抑えます。",
          capRatio: hypertrophyCapRatio
        },
        estimatedOneRepMaxKg,
        weightUnit,
        e1RmAdjustmentNotes
      ),
      buildCappedTarget(
        {
          category: "hypertrophy_target",
          weightKg: hypertrophyRanges[2].weight,
          minReps: hypertrophyRanges[2].min,
          maxReps: hypertrophyRanges[2].max,
          sets: hypertrophyRanges[2].sets,
          note: "対象筋への刺激を残す軽めのバックオフ候補。",
          capRatio: hypertrophyCapRatio
        },
        estimatedOneRepMaxKg,
        weightUnit,
        e1RmAdjustmentNotes
      )
    ],
    fatigue_management_target: [
      buildCappedTarget(
        {
          category: "fatigue_management_target",
          weightKg: fatigueRanges[0].weight,
          minReps: fatigueRanges[0].min,
          maxReps: fatigueRanges[0].max,
          sets: fatigueRanges[0].sets,
          note: "重量感だけ確認し、推定1RMを更新しにいかない調整セット。",
          capRatio: fatigueCapRatio
        },
        estimatedOneRepMaxKg,
        weightUnit,
        e1RmAdjustmentNotes
      ),
      buildCappedTarget(
        {
          category: "fatigue_management_target",
          weightKg: fatigueRanges[1].weight,
          minReps: fatigueRanges[1].min,
          maxReps: fatigueRanges[1].max,
          sets: fatigueRanges[1].sets,
          note: "疲労を残しすぎない範囲でメイン動作を維持します。",
          capRatio: fatigueCapRatio
        },
        estimatedOneRepMaxKg,
        weightUnit,
        e1RmAdjustmentNotes
      ),
      buildCappedTarget(
        {
          category: "fatigue_management_target",
          weightKg: fatigueRanges[2].weight,
          minReps: fatigueRanges[2].min,
          maxReps: fatigueRanges[2].max,
          sets: fatigueRanges[2].sets,
          note: "体調に応じて追加する軽めの調整セット。",
          capRatio: fatigueCapRatio
        },
        estimatedOneRepMaxKg,
        weightUnit,
        e1RmAdjustmentNotes
      )
    ],
    priority_target: getPriorityTarget(primaryGoal, secondaryGoal)
  };

  guardrailNotes.push(
    `${exerciseName}: candidate_e1rm_check: 各候補は最大rep側で候補e1RMを逆算し、推定1RM ${formatWeight(estimatedOneRepMaxKg, weightUnit)} に対して筋力${Math.round(strengthCapRatio * 100)}%、筋肥大${Math.round(hypertrophyCapRatio * 100)}%、疲労管理${roundOne(fatigueCapRatio * 100)}%を上限目安に確認済み。`
  );
  guardrailNotes.push(
    `${exerciseName}: rejected_targets_due_to_e1rm: ${e1RmAdjustmentNotes.length ? e1RmAdjustmentNotes.join(" / ") : "上限超過で破棄した候補はありません。"}`
  );
  guardrailNotes.push(`${exerciseName}: 次回提案は今回の主要セット ${formatWeight(topWeight, weightUnit)}×${topReps}回 と推定1RMの整合性を優先します。`);
  guardrailNotes.push(`${exerciseName}: 高回数候補は候補e1RMが現在の推定1RMを大きく超えないよう、重量を十分に下げます。`);

  return { suggestedTargets, guardrailNotes };
}

export function summarizeExercise(
  exerciseName: string,
  sets: NormalizedTrainingSet[],
  options?: AnalysisOptions
): ExerciseAnalysis {
  const displayUnit = normalizeWeightUnit(options?.weightUnit);
  const classifiedSets = classifyExerciseSets(sets);
  const totalReps = classifiedSets.reduce((sum, set) => sum + set.reps, 0);
  const totalVolume = classifiedSets.reduce((sum, set) => sum + set.weight * set.reps, 0);
  const maxWeight = classifiedSets.reduce((max, set) => Math.max(max, set.weight), 0);
  const bestSet = getBestSet(classifiedSets) ?? null;
  const rmEligibleSets = classifiedSets.filter((set) => set.rm_eligible);
  const rmExcludedSets = classifiedSets.filter((set) => set.rm_exclusion_reason) as Array<
    NormalizedTrainingSet & { rm_exclusion_reason: string }
  >;
  const bestRmEligibleSet = getBestSet(rmEligibleSets) ?? null;
  const topSingleSet = rmEligibleSets
    .filter((set) => set.reps === 1)
    .sort((a, b) => b.weight - a.weight || a.set_order - b.set_order)[0] ?? null;
  const topSet = getTopSet(rmEligibleSets);
  const topSetNotes = getTopSetNotes(exerciseName, topSet, bestRmEligibleSet, displayUnit);
  const workingSets = classifiedSets.filter(
    (set) =>
      !set.is_assisted &&
      (set.effective_set_type === "main" ||
        set.effective_set_type === "normal" ||
        set.effective_set_type === "backoff")
  );
  const backoffSets = classifiedSets.filter(
    (set) => !set.is_assisted && set.effective_set_type === "backoff"
  );
  const setTypeCounts: Record<SetType, number> = {
    normal: 0,
    warmup: 0,
    main: 0,
    backoff: 0,
    drop: 0
  };

  for (const set of classifiedSets) {
    setTypeCounts[set.effective_set_type] += 1;
  }

  const { suggestedTargets, guardrailNotes } = buildSuggestedTargets(
    exerciseName,
    {
      bestRmEligibleSet,
      bestSet,
      topSingleSet,
      topSet,
      workingSetCount: workingSets.length,
      workingSets,
      assistedSetCount: classifiedSets.filter((set) => set.is_assisted).length
    },
    options?.primaryGoal,
    options?.secondaryGoal,
    displayUnit
  );
  guardrailNotes.push(
    `${exerciseName}: max_weight_vs_main_set_notes: max_weight=${formatWeight(maxWeight, displayUnit)}、top_single=${topSingleSet ? `${formatWeight(topSingleSet.weight, displayUnit)}×1回` : "なし"}、top_set=${topSet ? `${formatWeight(topSet.weight, displayUnit)}×${topSet.reps}回` : "なし"}、main_set=${bestRmEligibleSet ? `${formatWeight(bestRmEligibleSet.weight, displayUnit)}×${bestRmEligibleSet.reps}回` : "なし"}。最大重量、1回だけのトップシングル、1〜3回のトップセット、複数回のメインセットを混同せず、反復性能・再現性・推定1RM・総ボリュームを分けて説明します。`
  );
  guardrailNotes.push(topSetNotes);
  const analysis: ExerciseAnalysis = {
    exercise_name: exerciseName,
    set_count: classifiedSets.length,
    total_reps: totalReps,
    total_volume: roundOne(totalVolume),
    max_weight: maxWeight,
    max_weight_display: kgToDisplayWeight(maxWeight, displayUnit),
    weight_unit: displayUnit,
    best_set: bestSet
      ? {
          weight: bestSet.weight,
          display_weight: kgToDisplayWeight(bestSet.weight, displayUnit),
          display_unit: displayUnit,
          reps: bestSet.reps,
          estimated_1rm: bestSet.estimated_1rm,
          estimated_1rm_display: kgToDisplayWeight(bestSet.estimated_1rm, displayUnit),
          set_type: bestSet.effective_set_type,
          is_assisted: bestSet.is_assisted
        }
      : {
          weight: 0,
          display_weight: 0,
          display_unit: displayUnit,
          reps: 0,
          estimated_1rm: 0,
          estimated_1rm_display: 0,
          set_type: "normal",
          is_assisted: false
        },
    top_single: topSingleSet
      ? {
          weight: topSingleSet.weight,
          display_weight: kgToDisplayWeight(topSingleSet.weight, displayUnit),
          display_unit: displayUnit,
          reps: 1,
          estimated_1rm: topSingleSet.estimated_1rm,
          estimated_1rm_display: kgToDisplayWeight(topSingleSet.estimated_1rm, displayUnit),
          set_type: topSingleSet.effective_set_type,
          set_order: topSingleSet.set_order
        }
      : null,
    top_set: getSetSummary(topSet, displayUnit),
    top_set_estimated_1rm_kg: topSet?.estimated_1rm ?? null,
    top_set_notes: topSetNotes,
    main_set: getSetSummary(bestRmEligibleSet, displayUnit),
    sets: classifiedSets.map((set) => ({
      weight: set.weight,
      display_weight: kgToDisplayWeight(set.weight, displayUnit),
      display_unit: displayUnit,
      reps: set.reps,
      set_order: set.set_order,
      set_type: set.effective_set_type,
      declared_set_type: set.declared_set_type,
      is_assisted: set.is_assisted,
      set_memo: set.set_memo,
      estimated_1rm: set.estimated_1rm,
      rm_eligible: set.rm_eligible
    })),
    set_type_counts: setTypeCounts,
    assisted_set_count: classifiedSets.filter((set) => set.is_assisted).length,
    rm_eligible_sets: rmEligibleSets,
    rm_excluded_sets: rmExcludedSets,
    best_rm_eligible_set: bestRmEligibleSet,
    estimated_1rm_from_rm_eligible_sets: bestRmEligibleSet?.estimated_1rm ?? null,
    estimated_1rm_from_rm_eligible_sets_display: bestRmEligibleSet
      ? kgToDisplayWeight(bestRmEligibleSet.estimated_1rm, displayUnit)
      : null,
    working_set_count: workingSets.length,
    working_total_reps: workingSets.reduce((sum, set) => sum + set.reps, 0),
    working_total_volume: roundOne(workingSets.reduce((sum, set) => sum + set.weight * set.reps, 0)),
    backoff_total_volume: roundOne(backoffSets.reduce((sum, set) => sum + set.weight * set.reps, 0)),
    same_weight_repetition_quality: getSameWeightQuality(workingSets),
    repeated_main_performance: getRepeatedMainPerformance(workingSets, bestRmEligibleSet, displayUnit),
    fatigue_drop: getFatigueDrop(workingSets),
    set_classification_notes: classifiedSets
      .map((set) => set.classification_note)
      .filter((note): note is string => Boolean(note))
      .concat(
        rmExcludedSets.length
          ? [`RM評価から除外または参考扱いにしたセットが${rmExcludedSets.length}件あります。`]
          : []
      ),
    suggested_targets: suggestedTargets,
    guardrail_notes: guardrailNotes
  };

  if (options?.bodyWeightKg && options.bodyWeightKg > 0) {
    analysis.max_weight_bodyweight_ratio = roundOne(maxWeight / options.bodyWeightKg);
    if (bestRmEligibleSet) {
      analysis.estimated_1rm_bodyweight_ratio = roundOne(bestRmEligibleSet.estimated_1rm / options.bodyWeightKg);
    }
  }

  return analysis;
}

export function buildCurrentTrainingAnalysis(
  sets: NormalizedTrainingSet[],
  options?: AnalysisOptions
): CurrentTrainingAnalysis {
  const grouped = new Map<string, NormalizedTrainingSet[]>();

  for (const set of sets) {
    grouped.set(set.exercise_name, [...(grouped.get(set.exercise_name) ?? []), set]);
  }

  const exercisesSummary = Array.from(grouped.entries())
    .map(([exerciseName, exerciseSets]) => summarizeExercise(exerciseName, exerciseSets, options))
    .sort((a, b) => {
      const aOrder = sets.find((set) => set.exercise_name === a.exercise_name)?.exercise_order ?? 0;
      const bOrder = sets.find((set) => set.exercise_name === b.exercise_name)?.exercise_order ?? 0;
      return aOrder - bOrder;
    });

  return {
    exercise_count: exercisesSummary.length,
    total_sets: sets.length,
    total_reps: sets.reduce((sum, set) => sum + set.reps, 0),
    total_volume: roundOne(sets.reduce((sum, set) => sum + set.weight * set.reps, 0)),
    main_exercises: exercisesSummary.slice(0, 1).map((exercise) => exercise.exercise_name),
    accessory_exercises: exercisesSummary.slice(1).map((exercise) => exercise.exercise_name),
    exercises_summary: exercisesSummary
  };
}

function compareTrendFromSessions(
  sessions: Array<ExerciseAnalysis & { session_id: string; session_date: string }>
): TrendLabel {
  if (sessions.length < 2) {
    return "insufficient_data";
  }

  const latest = sessions[0]?.estimated_1rm_from_rm_eligible_sets ?? 0;
  const oldest = sessions[Math.min(sessions.length, 3) - 1]?.estimated_1rm_from_rm_eligible_sets ?? latest;

  if (!latest || !oldest) {
    return "insufficient_data";
  }

  const pct = (latest - oldest) / oldest;

  if (pct > 0.03) {
    return "improving";
  }

  if (pct > 0.01) {
    return "slightly_improving";
  }

  if (pct < -0.04) {
    return "declining";
  }

  if (pct < -0.015) {
    return "slightly_declining";
  }

  return "stable";
}

export function compareCurrentToPrevious(
  current: ExerciseAnalysis,
  previous: PreviousExerciseAnalysis | undefined
): TrendLabel {
  const latest = previous?.previous_sessions[0];

  if (!latest) {
    return "insufficient_data";
  }

  const currentRm = current.estimated_1rm_from_rm_eligible_sets;
  const previousRm = latest.estimated_1rm_from_rm_eligible_sets;

  if (!currentRm || !previousRm) {
    return "insufficient_data";
  }

  const rmPct = (currentRm - previousRm) / previousRm;
  const volumePct = latest.working_total_volume
    ? (current.working_total_volume - latest.working_total_volume) / latest.working_total_volume
    : 0;
  const currentQuality = current.same_weight_repetition_quality;
  const previousSameWeightSet = latest.sets
    .filter((set) => currentQuality.weight !== null && set.weight === currentQuality.weight)
    .sort((a, b) => b.reps - a.reps)[0];
  const sameWeightRepDelta =
    currentQuality.max_reps !== null && previousSameWeightSet
      ? currentQuality.max_reps - previousSameWeightSet.reps
      : 0;
  const workingSetDelta = current.working_set_count - latest.working_set_count;
  const negativeSignals = [
    rmPct < -0.03,
    volumePct < -0.08,
    sameWeightRepDelta < 0,
    workingSetDelta < 0
  ].filter(Boolean).length;
  const positiveSignals = [
    rmPct > 0.025,
    volumePct > 0.08,
    sameWeightRepDelta > 0,
    workingSetDelta > 0
  ].filter(Boolean).length;

  if (negativeSignals >= 3) {
    return "declining";
  }

  if (negativeSignals >= 2) {
    return "slightly_declining";
  }

  if (positiveSignals >= 2 || rmPct > 0.035) {
    return "improving";
  }

  if (positiveSignals >= 1 || rmPct > 0.01) {
    return "slightly_improving";
  }

  return "stable";
}

export function pickLatestVisibleSessionsByDate(
  sessions: PreviousSessionForAnalysis[],
  currentSessionId: string,
  currentSessionDate: string
) {
  const latestByDate = new Map<string, PreviousSessionForAnalysis>();

  for (const session of sessions
    .filter(
      (candidate) =>
        candidate.id !== currentSessionId &&
        candidate.session_date < currentSessionDate
    )
    .sort(
      (a, b) =>
        b.session_date.localeCompare(a.session_date) ||
        b.created_at.localeCompare(a.created_at)
    )) {
    if (!latestByDate.has(session.session_date)) {
      latestByDate.set(session.session_date, session);
    }
  }

  return Array.from(latestByDate.values());
}

export function buildPreviousTrainingAnalysis(
  previousSessions: PreviousSessionForAnalysis[],
  exerciseNames: string[],
  options?: AnalysisOptions
) {
  const result: Record<string, PreviousExerciseAnalysis> = {};

  for (const exerciseName of exerciseNames) {
    const sessions = previousSessions
      .map((session) => ({
        session_id: session.id,
        session_date: session.session_date,
        sets: (session.workout_sets ?? [])
          .filter((set) => set.exercise_name === exerciseName)
          .map(normalizeTrainingSet)
      }))
      .filter((session) => session.sets.length > 0)
      .slice(0, 3)
      .map((session) => ({
        session_id: session.session_id,
        session_date: session.session_date,
        ...summarizeExercise(exerciseName, session.sets, options)
      }));
    const latest = sessions[0];

    result[exerciseName] = {
      previous_sessions: sessions,
      previous_main_set: latest?.main_set ?? null,
      previous_repeated_main_performance: latest?.repeated_main_performance ?? null,
      previous_best_set: latest?.best_rm_eligible_set ?? null,
      previous_estimated_1rm: latest?.estimated_1rm_from_rm_eligible_sets ?? null,
      previous_total_volume: latest?.working_total_volume ?? null,
      previous_total_sets: latest?.working_set_count ?? null,
      previous_total_reps: latest?.working_total_reps ?? null,
      trend_last_3_sessions: compareTrendFromSessions(sessions)
    };
  }

  return result;
}

export function buildGoalTrainingPolicy(primaryGoal?: string | null, secondaryGoal?: string | null) {
  const activeGoals = [primaryGoal, secondaryGoal].filter(Boolean);

  return {
    active_goals: activeGoals,
    strength:
      "筋力アップでは、メインセット、トップセット、推定1RM、高重量の再現性、少量の重量更新、休息と疲労管理を重視します。",
    hypertrophy:
      "筋肥大では、総ボリューム、同重量での複数セット再現性、8〜15回帯、バックオフセット、対象部位への総刺激量を重視します。",
    fat_loss:
      "ダイエットでは、筋力維持、ボリューム維持、疲労管理、無理なPR狙いを避けた継続性を重視します。",
    body_make:
      "ボディメイクでは、部位バランス、弱点部位、補助種目、見た目づくり、種目構成を重視します。",
    health:
      "健康維持では、安全性、継続性、フォーム安定、過度な高重量回避を重視します。",
    contest:
      "競技・大会では、部位バランス、弱点補強、疲労管理、仕上がり、種目構成を重視します。",
    maintenance:
      "維持では、大きく落とさないこと、無理のない継続、適度な強度維持を重視します。"
  };
}
