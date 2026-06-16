"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  displayWeightToKg,
  formatWeight,
  formatWeightNumber,
  kgToDisplayWeight,
  normalizeWeightUnit,
  roundWeightByIncrement,
  type WeightUnit
} from "@/lib/weight-unit";

type SetType = "normal" | "warmup" | "main" | "backoff" | "drop";

type SetInput = {
  weight: string;
  reps: string;
  setType: SetType;
  isAssisted: boolean;
  setMemo: string;
};

const setTypeOptions: Array<{ value: SetType; label: string }> = [
  { value: "normal", label: "通常" },
  { value: "warmup", label: "アップ" },
  { value: "main", label: "メイン" },
  { value: "backoff", label: "バックオフ" },
  { value: "drop", label: "ドロップ" }
];

const weightIncrementOptions = [1, 1.25, 2.5, 5];

type ExerciseCategory = {
  id: string;
  user_id: string | null;
  name: string;
  sort_order: number;
  is_default: boolean;
};

type Exercise = {
  id: string;
  user_id: string | null;
  category_id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
};

type AiReportStatus = "not_generated" | "generated" | "stale";

type PreviousSet = {
  id: string;
  session_id: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  exercise_order?: number;
  set_type?: SetType | string | null;
  is_assisted?: boolean | null;
  set_memo?: string | null;
  created_at: string;
  session_date: string;
  session_created_at: string;
};

type ExistingWorkoutSet = {
  id: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  exercise_order?: number;
  set_type?: SetType | string | null;
  is_assisted?: boolean | null;
  set_memo?: string | null;
};

type PreviousSession = {
  sessionId: string;
  sessionDate: string;
  sets: PreviousSet[];
};

type PreviousWorkoutSetRow = {
  id: string;
  session_id: string;
  exercise_name: string;
  weight: number | string;
  reps: number;
  set_order: number;
  exercise_order?: number;
  set_type?: SetType | string | null;
  is_assisted?: boolean | null;
  set_memo?: string | null;
  created_at: string;
};

type PreviousWorkoutSession = {
  id: string;
  session_date: string;
  created_at: string;
  workout_sets: PreviousWorkoutSetRow[];
};

type WorkoutExerciseBlock = {
  localId: string;
  exerciseId: string;
  categoryId: string;
  name: string;
  sets: SetInput[];
  previousSets: PreviousSet[];
  loadingPrevious: boolean;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSetType(value: unknown): value is SetType {
  return (
    value === "normal" ||
    value === "warmup" ||
    value === "main" ||
    value === "backoff" ||
    value === "drop"
  );
}

function normalizeSetType(value: unknown): SetType {
  return isSetType(value) ? value : "normal";
}

function normalizeWeightIncrement(value: unknown) {
  const parsed = Number(value);
  return weightIncrementOptions.includes(parsed) ? parsed : 2.5;
}

function createSetInput(partial?: Partial<SetInput>): SetInput {
  return {
    weight: partial?.weight ?? "100",
    reps: partial?.reps ?? "8",
    setType: partial?.setType ?? "normal",
    isAssisted: partial?.isAssisted ?? false,
    setMemo: partial?.setMemo ?? ""
  };
}

function groupPreviousSets(previousSets: PreviousSet[]) {
  const sessionMap = new Map<string, PreviousSession>();

  for (const set of previousSets) {
    const existing = sessionMap.get(set.session_id);

    if (existing) {
      existing.sets.push(set);
    } else {
      sessionMap.set(set.session_id, {
        sessionId: set.session_id,
        sessionDate: set.session_date,
        sets: [set]
      });
    }
  }

  return Array.from(sessionMap.values())
    .map((session) => ({
      ...session,
      sets: session.sets
        .slice()
        .sort(
          (a, b) =>
            (a.exercise_order ?? 0) - (b.exercise_order ?? 0) ||
            a.set_order - b.set_order
        )
    }))
    .slice(0, 3);
}

function NewWorkoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sessionDate, setSessionDate] = useState(searchParams.get("date") ?? todayString());
  const [categories, setCategories] = useState<ExerciseCategory[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseBlock[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingAiReportStatus, setEditingAiReportStatus] =
    useState<AiReportStatus>("not_generated");
  const [focusExercise, setFocusExercise] = useState(searchParams.get("focusExercise") ?? "");
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategoryId, setNewExerciseCategoryId] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [weightIncrement, setWeightIncrement] = useState(2.5);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState("");
  const weightStepDeltas = useMemo(
    () => [-2 * weightIncrement, -weightIncrement, weightIncrement, 2 * weightIncrement],
    [weightIncrement]
  );

  async function fetchPreviousSets(
    exerciseName: string,
    options?: {
      excludeSessionId?: string;
      referenceDate?: string;
      requestUserId?: string;
    }
  ) {
    const referenceDate = options?.referenceDate || sessionDate;
    const excludedSessionId = options?.excludeSessionId ?? "";
    const effectiveUserId = options?.requestUserId || userId;

    console.log("previous history requested exercise_name", exerciseName);
    console.log("editing session_date", referenceDate);
    console.log("editing session_id", excludedSessionId || "(new session)");

    let query = supabase
      .from("workout_sessions")
      .select(
        "id, session_date, created_at, workout_sets(id, session_id, exercise_name, weight, reps, set_order, exercise_order, set_type, is_assisted, set_memo, created_at)"
      )
      .lt("session_date", referenceDate)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120);

    if (effectiveUserId) {
      query = query.eq("user_id", effectiveUserId);
    }

    if (excludedSessionId) {
      query = query.neq("id", excludedSessionId);
    }

    const { data, error: previousError } = await query;

    if (previousError) {
      console.error("previous history load error", previousError.message);
      return [];
    }

    const latestByDate = new Map<string, PreviousWorkoutSession>();

    for (const session of (data ?? []) as PreviousWorkoutSession[]) {
      if (!latestByDate.has(session.session_date)) {
        latestByDate.set(session.session_date, session);
      }
    }

    const effectiveSessions = Array.from(latestByDate.values());
    const previousSets = effectiveSessions.flatMap((session) =>
      (session.workout_sets ?? [])
        .filter((set) => set.exercise_name === exerciseName)
        .sort(
          (a, b) =>
            (a.exercise_order ?? 0) - (b.exercise_order ?? 0) ||
            a.set_order - b.set_order
        )
        .map((set) => ({
          id: set.id,
          session_id: session.id,
          exercise_name: set.exercise_name,
          weight: set.weight,
          reps: set.reps,
          set_order: set.set_order,
          exercise_order: set.exercise_order,
          set_type: set.set_type,
          is_assisted: set.is_assisted,
          set_memo: set.set_memo,
          created_at: set.created_at,
          session_date: session.session_date,
          session_created_at: session.created_at
        }))
    );
    const previousSessionGroups = groupPreviousSets(previousSets);
    const previousSetsShown = previousSessionGroups.flatMap((session) => session.sets);
    const previousSessionsUsed = previousSessionGroups.map((session) => ({
      session_id: session.sessionId,
      session_date: session.sessionDate,
      exercise_name: exerciseName
    }));

    console.log("previous sessions used", previousSessionsUsed);
    console.log(
      "previous sets shown",
      previousSetsShown.map((set) => ({
        session_id: set.session_id,
        session_date: set.session_date,
        weight: Number(set.weight),
        reps: set.reps,
        set_order: set.set_order
      }))
    );

    return previousSetsShown;
  }

  async function buildBlocksFromSets(
    sets: ExistingWorkoutSet[],
    exerciseList: Exercise[],
    excludeSessionId: string,
    referenceDate: string,
    requestUserId?: string,
    displayUnit: WeightUnit = weightUnit
  ) {
    const grouped = new Map<string, ExistingWorkoutSet[]>();

    for (const set of sets.slice().sort((a, b) => {
      const aExerciseOrder = a.exercise_order ?? 0;
      const bExerciseOrder = b.exercise_order ?? 0;

      return aExerciseOrder - bExerciseOrder || a.set_order - b.set_order;
    })) {
      const current = grouped.get(set.exercise_name) ?? [];
      current.push(set);
      grouped.set(set.exercise_name, current);
    }

    return Promise.all(
      Array.from(grouped.entries()).map(async ([name, groupedSets]) => {
        const matchedExercise = exerciseList.find((exercise) => exercise.name === name);
        const previousSets = await fetchPreviousSets(name, {
          excludeSessionId,
          referenceDate,
          requestUserId
        });

        return {
          localId: createLocalId(),
          exerciseId: matchedExercise?.id ?? name,
          categoryId: matchedExercise?.category_id ?? selectedCategoryId,
          name,
          sets: groupedSets.map((set) =>
            createSetInput({
              weight: formatWeightNumber(kgToDisplayWeight(set.weight, displayUnit)),
              reps: String(set.reps),
              setType: normalizeSetType(set.set_type),
              isAssisted: Boolean(set.is_assisted),
              setMemo: set.set_memo ?? ""
            })
          ),
          previousSets,
          loadingPrevious: false
        } satisfies WorkoutExerciseBlock;
      })
    );
  }

  async function loadSessionById(
    sessionId: string,
    exerciseList = exercises,
    requestUserId = userId,
    displayUnit: WeightUnit = weightUnit
  ) {
    setError("");

    const { data, error: sessionError } = await supabase
      .from("workout_sessions")
      .select(
        "id, session_date, title, ai_report_status, workout_sets(id, exercise_name, weight, reps, set_order, exercise_order, set_type, is_assisted, set_memo)"
      )
      .eq("id", sessionId)
      .single();

    if (sessionError || !data) {
      setEditingSessionId("");
      setEditingAiReportStatus("not_generated");
      setWorkoutExercises([]);
      setError(sessionError?.message ?? "セッションを読み込めませんでした。");
      return;
    }

    const session = data as {
      id: string;
      session_date: string;
      ai_report_status: AiReportStatus;
      workout_sets: ExistingWorkoutSet[];
    };

    setEditingSessionId(session.id);
    setEditingAiReportStatus(session.ai_report_status ?? "not_generated");
    setSessionDate(session.session_date);
    setWorkoutExercises(
      await buildBlocksFromSets(
        session.workout_sets ?? [],
        exerciseList,
        session.id,
        session.session_date,
        requestUserId,
        displayUnit
      )
    );
  }

  async function loadSessionByDate(
    date: string,
    exerciseList = exercises,
    requestUserId = userId,
    displayUnit: WeightUnit = weightUnit
  ) {
    setError("");

    const { data, error: sessionError } = await supabase
      .from("workout_sessions")
      .select(
        "id, session_date, title, ai_report_status, workout_sets(id, exercise_name, weight, reps, set_order, exercise_order, set_type, is_assisted, set_memo)"
      )
      .eq("session_date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      setEditingSessionId("");
      setEditingAiReportStatus("not_generated");
      setWorkoutExercises([]);
      setError(sessionError.message);
      return;
    }

    if (!data) {
      setEditingSessionId("");
      setEditingAiReportStatus("not_generated");
      setWorkoutExercises([]);
      return;
    }

    const session = data as {
      id: string;
      session_date: string;
      ai_report_status: AiReportStatus;
      workout_sets: ExistingWorkoutSet[];
    };

    setEditingSessionId(session.id);
    setEditingAiReportStatus(session.ai_report_status ?? "not_generated");
    setWorkoutExercises(
      await buildBlocksFromSets(
        session.workout_sets ?? [],
        exerciseList,
        session.id,
        session.session_date,
        requestUserId,
        displayUnit
      )
    );
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const [categoriesResult, exercisesResult, inputSettingsResult] = await Promise.all([
        supabase
          .from("exercise_categories")
          .select("id, user_id, name, sort_order, is_default")
          .or(`is_default.eq.true,user_id.eq.${user.id}`)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("exercises")
          .select("id, user_id, category_id, name, sort_order, is_default")
          .or(`is_default.eq.true,user_id.eq.${user.id}`)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("user_fitness_profiles")
          .select("weight_unit, weight_increment")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      if (!active) {
        return;
      }

      setUserId(user.id);

      if (categoriesResult.error) {
        setError(categoriesResult.error.message);
      } else {
        const loadedCategories = (categoriesResult.data ?? []) as ExerciseCategory[];
        const firstCategoryId = loadedCategories[0]?.id ?? "";
        setCategories(loadedCategories);
        setSelectedCategoryId((current) => current || firstCategoryId);
        setNewExerciseCategoryId((current) => current || firstCategoryId);
      }

      if (exercisesResult.error) {
        setError(exercisesResult.error.message);
      } else {
        setExercises((exercisesResult.data ?? []) as Exercise[]);
      }

      const nextWeightUnit = inputSettingsResult.data
        ? normalizeWeightUnit(inputSettingsResult.data.weight_unit)
        : "kg";
      const nextWeightIncrement = inputSettingsResult.data
        ? normalizeWeightIncrement(inputSettingsResult.data.weight_increment)
        : 2.5;

      if (inputSettingsResult.error) {
        console.error("workout input settings load error", inputSettingsResult.error.message);
      } else if (inputSettingsResult.data) {
        setWeightUnit(nextWeightUnit);
        setWeightIncrement(nextWeightIncrement);
      }

      const loadedExercises = (exercisesResult.data ?? []) as Exercise[];
      const querySessionId = searchParams.get("sessionId");
      const queryDate = searchParams.get("date") ?? todayString();
      const queryFocusExercise = searchParams.get("focusExercise") ?? "";

      setFocusExercise(queryFocusExercise);

      if (querySessionId) {
        await loadSessionById(querySessionId, loadedExercises, user.id, nextWeightUnit);
      } else {
        setSessionDate(queryDate);
        await loadSessionByDate(queryDate, loadedExercises, user.id, nextWeightUnit);
      }

      setCatalogLoading(false);
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [router, searchParams, supabase]);

  useEffect(() => {
    if (!focusExercise || workoutExercises.length === 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(`exercise-${encodeURIComponent(focusExercise)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusExercise, workoutExercises.length]);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const visibleExercises = useMemo(() => {
    const search = exerciseSearch.trim().toLowerCase();

    return exercises
      .filter((exercise) => exercise.category_id === selectedCategoryId)
      .filter((exercise) => !search || exercise.name.toLowerCase().includes(search))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [exerciseSearch, exercises, selectedCategoryId]);

  function selectCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setNewExerciseCategoryId(categoryId);
    setExerciseSearch("");
  }

  async function addWorkoutExercise(exercise: Exercise) {
    if (workoutExercises.some((item) => item.exerciseId === exercise.id)) {
      setError("この種目は一覧に追加済みです。");
      setPickerOpen(false);
      return;
    }

    setError("");
    const localId = createLocalId();
    const nextBlock: WorkoutExerciseBlock = {
      localId,
      exerciseId: exercise.id,
      categoryId: exercise.category_id,
      name: exercise.name,
      sets: [createSetInput()],
      previousSets: [],
      loadingPrevious: true
    };

    setWorkoutExercises((current) => [...current, nextBlock]);
    setPickerOpen(false);
    setExerciseSearch("");

    const previousSets = await fetchPreviousSets(exercise.name, {
      excludeSessionId: editingSessionId || undefined,
      referenceDate: sessionDate,
      requestUserId: userId
    });

    setWorkoutExercises((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, previousSets, loadingPrevious: false }
          : item
      )
    );
  }

  function updateSet(blockId: string, setIndex: number, patch: Partial<SetInput>) {
    setWorkoutExercises((current) =>
      current.map((block) =>
        block.localId === blockId
          ? {
              ...block,
              sets: block.sets.map((set, index) =>
                index === setIndex ? { ...set, ...patch } : set
              )
            }
          : block
      )
    );
  }

  function adjustWeight(blockId: string, setIndex: number, delta: number) {
    const block = workoutExercises.find((item) => item.localId === blockId);
    const value = Number(block?.sets[setIndex]?.weight || 0);
    updateSet(blockId, setIndex, {
      weight: formatWeightNumber(
        roundWeightByIncrement(Math.max(0, value + delta), weightIncrement)
      )
    });
  }

  function adjustReps(blockId: string, setIndex: number, delta: number) {
    const block = workoutExercises.find((item) => item.localId === blockId);
    const value = Number(block?.sets[setIndex]?.reps || 0);
    updateSet(blockId, setIndex, { reps: String(Math.max(1, value + delta)) });
  }

  function addSet(blockId: string) {
    setWorkoutExercises((current) =>
      current.map((block) => {
        if (block.localId !== blockId) {
          return block;
        }

        const last = block.sets[block.sets.length - 1] ?? createSetInput({ weight: "", reps: "" });
        return { ...block, sets: [...block.sets, createSetInput(last)] };
      })
    );
  }

  function removeSet(blockId: string, setIndex: number) {
    setWorkoutExercises((current) =>
      current.map((block) =>
        block.localId === blockId
          ? { ...block, sets: block.sets.filter((_, index) => index !== setIndex) }
          : block
      )
    );
  }

  function removeExercise(blockId: string) {
    setWorkoutExercises((current) => current.filter((block) => block.localId !== blockId));
  }

  async function addCustomExercise() {
    const cleanName = newExerciseName.trim();

    if (!userId || !newExerciseCategoryId || !cleanName) {
      setError("追加する種目名と部位を入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: addError } = await supabase
      .from("exercises")
      .insert({
        user_id: userId,
        category_id: newExerciseCategoryId,
        name: cleanName,
        sort_order: 999,
        is_default: false
      })
      .select("id, user_id, category_id, name, sort_order, is_default")
      .single();

    if (addError || !data) {
      setError(addError?.message ?? "種目追加に失敗しました。");
      setLoading(false);
      return;
    }

    const newExercise = data as Exercise;
    setExercises((current) => [...current, newExercise]);
    setShowAddExercise(false);
    setNewExerciseName("");
    setSelectedCategoryId(newExercise.category_id);
    setNewExerciseCategoryId(newExercise.category_id);
    setLoading(false);
    await addWorkoutExercise(newExercise);
  }

  async function saveSession() {
    const validBlocks = workoutExercises
      .map((block, blockIndex) => ({
        ...block,
        exercise_order: blockIndex + 1,
        validSets: block.sets
          .map((set) => ({
            weight: displayWeightToKg(set.weight, weightUnit),
            reps: Number(set.reps),
            setType: set.setType,
            isAssisted: set.isAssisted,
            setMemo: set.setMemo.trim()
          }))
          .filter((set) => block.name && set.weight >= 0 && set.reps > 0)
      }))
      .filter((block) => block.validSets.length > 0);

    if (!userId || validBlocks.length === 0) {
      setError("少なくとも1種目と1セットを入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    const names = validBlocks.map((block) => block.name);
    const title = names.length === 1 ? names[0] : `${names[0]} 他${names.length - 1}種目`;
    const nextAiReportStatus: AiReportStatus = editingSessionId
      ? editingAiReportStatus === "generated"
        ? "stale"
        : editingAiReportStatus
      : "not_generated";

    const sessionResult = editingSessionId
      ? await supabase
          .from("workout_sessions")
          .update({
            session_date: sessionDate,
            title,
            ai_report_status: nextAiReportStatus
          })
          .eq("id", editingSessionId)
          .select("id")
          .single()
      : await supabase
          .from("workout_sessions")
          .insert({
            user_id: userId,
            session_date: sessionDate,
            title,
            ai_report_status: "not_generated"
          })
          .select("id")
          .single();

    const { data: session, error: sessionError } = sessionResult;

    if (sessionError || !session) {
      setError(sessionError?.message ?? "セッション保存に失敗しました。");
      setLoading(false);
      return;
    }

    await supabase.from("ai_reports").delete().eq("session_id", session.id);

    if (editingSessionId) {
      const { error: deleteSetsError } = await supabase
        .from("workout_sets")
        .delete()
        .eq("session_id", session.id);

      if (deleteSetsError) {
        setError(deleteSetsError.message);
        setLoading(false);
        return;
      }
    }

    let globalSetOrder = 1;
    const setRows = validBlocks.flatMap((block) =>
      block.validSets.map((set) => ({
        session_id: session.id,
        user_id: userId,
        exercise_name: block.name,
        weight: set.weight,
        reps: set.reps,
        exercise_order: block.exercise_order,
        set_order: globalSetOrder++,
        set_type: set.setType,
        is_assisted: set.isAssisted,
        set_memo: set.setMemo || null
      }))
    );

    const { error: setsError } = await supabase.from("workout_sets").insert(setRows);

    if (setsError) {
      setError(setsError.message);
      setLoading(false);
      return;
    }

    router.push(`/reports/${session.id}`);
  }

  async function handleDateChange(nextDate: string) {
    setSessionDate(nextDate);
    setFocusExercise("");
    await loadSessionByDate(nextDate);
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="eyebrow">Workout</p>
        <h1>トレーニング入力</h1>
      </header>

      <section className="panel">
        <label className="field">
          <span>セッション日付</span>
          <input
            className="input"
            type="date"
            value={sessionDate}
            onChange={(event) => void handleDateChange(event.target.value)}
          />
        </label>
      </section>

      <section className="panel">
        <div className="row">
          <div>
            <p className="eyebrow">種目一覧</p>
            <h2>{workoutExercises.length}種目</h2>
          </div>
          {catalogLoading ? <span className="muted">読込中</span> : null}
        </div>

        {workoutExercises.length === 0 ? (
          <div className="status">まだ種目がありません。まず種目を追加してください。</div>
        ) : (
          <div className="stack">
            {workoutExercises.map((block, blockIndex) => {
              const previousSessions = groupPreviousSets(block.previousSets);

              return (
                <article
                  className={
                    focusExercise && focusExercise === block.name
                      ? "workout-exercise-card is-focused"
                      : "workout-exercise-card"
                  }
                  id={`exercise-${encodeURIComponent(block.name)}`}
                  key={block.localId}
                >
                  <div className="row">
                    <div>
                      <p className="eyebrow">種目 {blockIndex + 1}</p>
                      <div className="exercise-title-row">
                        <h2>{block.name}</h2>
                        {focusExercise && focusExercise === block.name ? (
                          <span className="focus-badge">編集中</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="button ghost danger"
                      type="button"
                      onClick={() => removeExercise(block.localId)}
                    >
                      削除
                    </button>
                  </div>

                  <div className="previous-mini">
                    <h3>前回履歴</h3>
                    {block.loadingPrevious ? <p className="muted">読込中</p> : null}
                    {!block.loadingPrevious && previousSessions.length === 0 ? (
                      <p className="muted">この種目の前回ログはまだありません。</p>
                    ) : null}
                    {previousSessions.map((session, index) => (
                      <div className="previous-row" key={session.sessionId}>
                        <div>
                          <strong>{index === 0 ? "前回" : `${index + 1}回前`}</strong>
                          <span>{session.sessionDate}</span>
                        </div>
                        <p>
                          {session.sets
                            .map((set) => `${formatWeight(set.weight, weightUnit)} × ${set.reps}`)
                            .join(" / ")}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="set-list-compact">
                    {block.sets.map((set, setIndex) => (
                      <article className="set-row-card" key={`${block.localId}-${setIndex}`}>
                        <div className="set-row-main">
                          <div className="set-index">S{setIndex + 1}</div>
                          <label className="compact-number-field">
                            <span>重量</span>
                            <div className="compact-number-input">
                              <input
                                inputMode="decimal"
                                min="0"
                                step={weightIncrement}
                                type="number"
                                value={set.weight}
                                onChange={(event) =>
                                  updateSet(block.localId, setIndex, {
                                    weight: event.target.value
                                  })
                                }
                              />
                              <b>{weightUnit}</b>
                            </div>
                          </label>
                          <span className="set-times">×</span>
                          <label className="compact-number-field reps-field">
                            <span>回数</span>
                            <div className="compact-number-input">
                              <input
                                inputMode="numeric"
                                min="1"
                                step="1"
                                type="number"
                                value={set.reps}
                                onChange={(event) =>
                                  updateSet(block.localId, setIndex, {
                                    reps: event.target.value
                                  })
                                }
                              />
                              <b>回</b>
                            </div>
                          </label>
                          <select
                            aria-label={`セット${setIndex + 1}の種別`}
                            className="set-type-select"
                            value={set.setType}
                            onChange={(event) =>
                              updateSet(block.localId, setIndex, {
                                setType: normalizeSetType(event.target.value)
                              })
                            }
                          >
                            {setTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="set-stepper-strip">
                          {weightStepDeltas.map((delta) => (
                            <button
                              className="step-button"
                              key={delta}
                              type="button"
                              onClick={() => adjustWeight(block.localId, setIndex, delta)}
                            >
                              {delta > 0 ? "+" : ""}
                              {formatWeightNumber(delta)}
                            </button>
                          ))}
                          <button
                            className="step-button reps-step"
                            type="button"
                            onClick={() => adjustReps(block.localId, setIndex, -1)}
                          >
                            -1回
                          </button>
                          <button
                            className="step-button reps-step"
                            type="button"
                            onClick={() => adjustReps(block.localId, setIndex, 1)}
                          >
                            +1回
                          </button>
                        </div>

                        <div className="set-row-footer">
                          <details className="set-details compact-details">
                            <summary className="details-toggle">
                              <span className="toggle-label toggle-closed">詳細 ▼</span>
                              <span className="toggle-label toggle-open">閉じる ▲</span>
                              {set.isAssisted ? <span className="detail-badge">補助あり</span> : null}
                              {set.setMemo.trim() ? <span className="detail-badge">メモあり</span> : null}
                            </summary>
                            <label className="check-row compact-check">
                              <input
                                type="checkbox"
                                checked={set.isAssisted}
                                onChange={(event) =>
                                  updateSet(block.localId, setIndex, {
                                    isAssisted: event.target.checked
                                  })
                                }
                              />
                              <span>補助あり</span>
                            </label>
                            <label className="field compact-memo">
                              <span>メモ（任意）</span>
                              <textarea
                                className="input textarea"
                                value={set.setMemo}
                                onChange={(event) =>
                                  updateSet(block.localId, setIndex, {
                                    setMemo: event.target.value
                                  })
                                }
                              />
                            </label>
                          </details>
                          {block.sets.length > 1 ? (
                            <button
                              className="text-danger-button"
                              type="button"
                              onClick={() => removeSet(block.localId, setIndex)}
                            >
                              削除
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>

                  <button
                    className="button secondary full"
                    type="button"
                    onClick={() => addSet(block.localId)}
                  >
                    ＋セット追加
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <button
        className="button secondary full"
        type="button"
        onClick={() => setPickerOpen((current) => !current)}
      >
        ＋種目を追加
      </button>

      {pickerOpen ? (
        <section className="panel">
          <div className="row">
            <div>
              <p className="eyebrow">種目追加</p>
              <h2>{selectedCategory?.name ?? "部位を選択"}</h2>
            </div>
            <button className="button ghost" type="button" onClick={() => setPickerOpen(false)}>
              閉じる
            </button>
          </div>

          <div className="chip-row" aria-label="部位選択">
            {categories.map((category) => (
              <button
                key={category.id}
                className={
                  category.id === selectedCategoryId ? "chip-button is-selected" : "chip-button"
                }
                type="button"
                onClick={() => selectCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          <label className="field">
            <span>種目検索</span>
            <input
              className="input"
              autoComplete="off"
              placeholder="ベンチ、スクワットなど"
              value={exerciseSearch}
              onChange={(event) => setExerciseSearch(event.target.value)}
            />
          </label>

          <div className="exercise-grid">
            {visibleExercises.map((exercise) => (
              <button
                key={exercise.id}
                className="exercise-button"
                type="button"
                onClick={() => void addWorkoutExercise(exercise)}
              >
                <span>{exercise.name}</span>
                {!exercise.is_default ? <small>追加済み</small> : null}
              </button>
            ))}
          </div>

          {!catalogLoading && visibleExercises.length === 0 ? (
            <div className="status">この部位に一致する種目がありません。種目を追加できます。</div>
          ) : null}

          <button
            className="button ghost full"
            type="button"
            onClick={() => {
              setNewExerciseCategoryId(selectedCategoryId);
              setShowAddExercise((current) => !current);
            }}
          >
            ＋種目追加
          </button>

          {showAddExercise ? (
            <div className="add-exercise-box">
              <label className="field">
                <span>追加する種目名</span>
                <input
                  className="input"
                  autoComplete="off"
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>部位</span>
                <select
                  className="input"
                  value={newExerciseCategoryId}
                  onChange={(event) => setNewExerciseCategoryId(event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button full"
                type="button"
                disabled={loading}
                onClick={() => void addCustomExercise()}
              >
                種目を保存して追加
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <button className="button full" type="button" disabled={loading} onClick={saveSession}>
        {editingSessionId ? "セッションを更新" : "セッションを保存"}
      </button>

      {error ? <div className="status error">{error}</div> : null}
    </div>
  );
}

export default function NewWorkoutPage() {
  return (
    <Suspense fallback={<div className="status">読込中です。</div>}>
      <NewWorkoutPageContent />
    </Suspense>
  );
}
