import {
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

function roundToIncrement(value: number, increment = 2.5) {
  return roundOne(Math.round(value / increment) * increment);
}

function formatTarget(
  weightKg: number,
  reps: string,
  sets: string,
  note: string,
  weightUnit: WeightUnit
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
    text: `${formatWeight(weightKg, weightUnit)} × ${reps}回 × ${sets}セット`
  };
}

export function estimateOneRepMax(weight: number, reps: number) {
  return roundOne(weight * (1 + reps / 30));
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

function buildSuggestedTargets(
  exerciseName: string,
  analysisBase: {
    bestRmEligibleSet: NormalizedTrainingSet | null;
    bestSet: NormalizedTrainingSet | null;
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

  const topWeight = representative.weight;
  const topReps = representative.reps;
  const workingSetCount = Math.max(1, analysisBase.workingSetCount);
  const nextSmallJump = topWeight >= 60 && topReps >= 8 && analysisBase.bestRmEligibleSet
    ? roundToIncrement(topWeight + 2.5)
    : topWeight;
  const cappedStrengthWeight = Math.min(nextSmallJump, roundToIncrement(topWeight * 1.035));
  const strengthWeight = Math.max(topWeight, cappedStrengthWeight);
  const strengthTopReps =
    strengthWeight > topWeight
      ? `${Math.max(1, topReps - 1)}〜${topReps}`
      : `${topReps}〜${topReps + 1}`;
  const secondarySets = Math.max(1, Math.min(2, workingSetCount - 1));
  const backoffWeight = Math.max(0, roundToIncrement(topWeight * 0.95));
  const hypertrophyMinSets = Math.max(2, Math.min(workingSetCount, 3));
  const hypertrophyMaxSets = Math.max(hypertrophyMinSets, Math.min(workingSetCount + 1, 4));
  const fatigueSets = Math.max(1, Math.min(workingSetCount, 3));
  const fatigueReps = `${Math.max(1, topReps - 1)}〜${topReps}`;

  guardrailNotes.push(`${exerciseName}: 次回提案は今回の主要セット ${formatWeight(topWeight, weightUnit)}×${topReps}回 を大きく下回らない範囲に制限します。`);
  guardrailNotes.push(`${exerciseName}: 急激な重量ジャンプを避け、上限は概ね今回主要重量の+${formatWeight(2.5, weightUnit)}前後に制限します。`);

  const suggestedTargets: SuggestedTargets = {
    strength_target: [
      formatTarget(strengthWeight, strengthTopReps, "1", "トップセット。無理に更新せず、フォームが崩れるなら据え置きます。", weightUnit),
      formatTarget(topWeight, `${Math.max(1, topReps - 1)}〜${topReps}`, String(Math.max(1, secondarySets)), "高重量の再現性を確認するメイン〜バックオフ候補。", weightUnit)
    ],
    hypertrophy_target: [
      formatTarget(topWeight, `${topReps}〜${topReps + 1}`, `${hypertrophyMinSets}〜${hypertrophyMaxSets}`, "同重量での複数セット再現性と総ボリュームを狙います。", weightUnit),
      formatTarget(backoffWeight, "10〜12", "1〜2", "対象筋への刺激を残すバックオフ候補。", weightUnit)
    ],
    fatigue_management_target: [
      formatTarget(topWeight, fatigueReps, String(fatigueSets), "重量は大きく変えず、疲労を見ながら維持します。", weightUnit),
      formatTarget(backoffWeight, "10", "1", "体調に応じて追加する軽めの調整セット。", weightUnit)
    ],
    priority_target: getPriorityTarget(primaryGoal, secondaryGoal)
  };

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
      workingSetCount: workingSets.length,
      workingSets,
      assistedSetCount: classifiedSets.filter((set) => set.is_assisted).length
    },
    options?.primaryGoal,
    options?.secondaryGoal,
    displayUnit
  );
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
