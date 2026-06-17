import Link from "next/link";
import { redirect } from "next/navigation";

import { getEffectivePlan, type BillingProfile } from "@/lib/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calculateEstimated1RM,
  formatWeight,
  kgToDisplayWeight,
  normalizeWeightUnit,
  type WeightUnit
} from "@/lib/weight-unit";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ProgressRange = "30" | "90" | "all";

type WorkoutSetRow = {
  id: string;
  user_id: string;
  exercise_name: string;
  weight: number | string;
  reps: number | string;
  set_order: number | string;
  set_type?: string | null;
  is_assisted?: boolean | null;
};

type WorkoutSessionRow = {
  id: string;
  user_id: string;
  session_date: string;
  created_at: string;
  workout_sets?: WorkoutSetRow[] | null;
};

type ExerciseRow = {
  name: string;
  user_id: string | null;
  is_default: boolean | null;
  exercise_categories?: { name?: string | null } | { name?: string | null }[] | null;
};

type FlatSet = {
  sessionId: string;
  sessionDate: string;
  exerciseName: string;
  weight: number;
  reps: number;
  setType: string;
  isAssisted: boolean;
};

type ExercisePr = {
  exerciseName: string;
  maxWeight: number;
  maxWeightDate: string;
  maxReps: number | null;
  maxRepsWeight: number | null;
  maxRepsDate: string | null;
  maxE1rm: number;
  maxE1rmWeight: number;
  maxE1rmReps: number;
  maxE1rmDate: string;
  maxVolumeSet: number | null;
  maxVolumeSetWeight: number | null;
  maxVolumeSetReps: number | null;
  maxVolumeSetDate: string | null;
  maxSessionVolume: number;
  maxSessionVolumeDate: string;
  lastDate: string;
};

type HistoryPoint = {
  date: string;
  e1rm: number;
  maxWeight: number;
  sessionVolume: number;
};

type WeeklySummary = {
  weekStart: string;
  trainingDays: number;
  exerciseCount: number;
  setCount: number;
  volume: number;
};

type BodyPartSummary = {
  categoryName: string;
  setCount: number;
  volume: number;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1
});
const prHeavySetMinRatio = 0.6;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRange(value: string | undefined): ProgressRange {
  return value === "30" || value === "90" || value === "all" ? value : "90";
}

function formatDateJst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function shiftDate(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getCutoffDate(days: number) {
  return shiftDate(formatDateJst(), -(days - 1));
}

function getMondayWeekStart(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diff);

  return date.toISOString().slice(0, 10);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDisplayNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDisplayWeight(weightKg: number, unit: WeightUnit) {
  return formatWeight(weightKg, unit);
}

function formatDisplayVolume(volumeKg: number, unit: WeightUnit) {
  return `${formatDisplayNumber(kgToDisplayWeight(volumeKg, unit))}${unit}`;
}

function isRmEligible(set: FlatSet) {
  return (
    set.weight > 0 &&
    set.reps > 0 &&
    set.setType !== "warmup" &&
    set.setType !== "drop" &&
    !set.isAssisted
  );
}

function getE1rm(set: FlatSet) {
  return calculateEstimated1RM(set.weight, set.reps) ?? 0;
}

function getPerformanceSets(sets: FlatSet[]) {
  const candidates = sets.filter(isRmEligible);

  return candidates.length ? candidates : sets.filter((set) => set.weight > 0 && set.reps > 0);
}

function getHeavyPrCandidateSets(sets: FlatSet[], maxWeight: number) {
  if (maxWeight <= 0) {
    return [];
  }

  const minWeight = maxWeight * prHeavySetMinRatio;

  return sets.filter((set) => isRmEligible(set) && set.weight >= minWeight);
}

function getCategoryName(exercise: ExerciseRow) {
  const category = Array.isArray(exercise.exercise_categories)
    ? exercise.exercise_categories[0]
    : exercise.exercise_categories;

  return category?.name?.trim() || "その他";
}

function buildCategoryMap(exercises: ExerciseRow[], userId: string) {
  const categoryMap = new Map<string, string>();

  for (const exercise of exercises.filter((item) => item.is_default)) {
    categoryMap.set(exercise.name, getCategoryName(exercise));
  }

  for (const exercise of exercises.filter((item) => item.user_id === userId)) {
    categoryMap.set(exercise.name, getCategoryName(exercise));
  }

  return categoryMap;
}

function flattenSets(sessions: WorkoutSessionRow[], userId: string) {
  return sessions.flatMap((session) =>
    (session.workout_sets ?? [])
      .filter((set) => set.user_id === userId)
      .map((set) => ({
        sessionId: session.id,
        sessionDate: session.session_date,
        exerciseName: set.exercise_name,
        weight: toNumber(set.weight),
        reps: toNumber(set.reps),
        setType: set.set_type ?? "normal",
        isAssisted: Boolean(set.is_assisted)
      }))
  );
}

function filterSetsByRange(sets: FlatSet[], range: ProgressRange) {
  if (range === "all") {
    return sets;
  }

  const cutoff = getCutoffDate(Number(range));

  return sets.filter((set) => set.sessionDate >= cutoff);
}

function buildPrs(sets: FlatSet[]) {
  const grouped = new Map<string, FlatSet[]>();

  for (const set of sets) {
    grouped.set(set.exerciseName, [...(grouped.get(set.exerciseName) ?? []), set]);
  }

  return Array.from(grouped.entries())
    .map(([exerciseName, exerciseSets]) => {
      const performanceSets = getPerformanceSets(exerciseSets);
      const maxWeightSet = performanceSets
        .slice()
        .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
      const heavyPrCandidateSets = getHeavyPrCandidateSets(
        exerciseSets,
        maxWeightSet?.weight ?? 0
      );
      const maxRepsSet = heavyPrCandidateSets
        .slice()
        .sort((a, b) => b.reps - a.reps || b.weight - a.weight)[0];
      const maxE1rmSet = performanceSets
        .slice()
        .sort((a, b) => getE1rm(b) - getE1rm(a) || b.weight - a.weight)[0];
      const maxVolumeSet = heavyPrCandidateSets
        .slice()
        .sort((a, b) => b.weight * b.reps - a.weight * a.reps)[0];
      const sessionVolumes = new Map<string, { date: string; volume: number }>();

      for (const set of exerciseSets) {
        const current = sessionVolumes.get(set.sessionId) ?? {
          date: set.sessionDate,
          volume: 0
        };
        current.volume += set.weight * set.reps;
        sessionVolumes.set(set.sessionId, current);
      }

      const maxSession = Array.from(sessionVolumes.values()).sort(
        (a, b) => b.volume - a.volume
      )[0];
      const lastDate = exerciseSets
        .map((set) => set.sessionDate)
        .sort((a, b) => b.localeCompare(a))[0];

      return {
        exerciseName,
        maxWeight: maxWeightSet?.weight ?? 0,
        maxWeightDate: maxWeightSet?.sessionDate ?? "",
        maxReps: maxRepsSet?.reps ?? null,
        maxRepsWeight: maxRepsSet?.weight ?? null,
        maxRepsDate: maxRepsSet?.sessionDate ?? null,
        maxE1rm: maxE1rmSet ? getE1rm(maxE1rmSet) : 0,
        maxE1rmWeight: maxE1rmSet?.weight ?? 0,
        maxE1rmReps: maxE1rmSet?.reps ?? 0,
        maxE1rmDate: maxE1rmSet?.sessionDate ?? "",
        maxVolumeSet: maxVolumeSet ? maxVolumeSet.weight * maxVolumeSet.reps : null,
        maxVolumeSetWeight: maxVolumeSet?.weight ?? null,
        maxVolumeSetReps: maxVolumeSet?.reps ?? null,
        maxVolumeSetDate: maxVolumeSet?.sessionDate ?? null,
        maxSessionVolume: maxSession?.volume ?? 0,
        maxSessionVolumeDate: maxSession?.date ?? "",
        lastDate
      };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.maxE1rm - a.maxE1rm);
}

function buildHistories(sets: FlatSet[]) {
  const grouped = new Map<string, Map<string, HistoryPoint>>();

  for (const set of sets) {
    const exerciseHistory = grouped.get(set.exerciseName) ?? new Map<string, HistoryPoint>();
    const current = exerciseHistory.get(set.sessionDate) ?? {
      date: set.sessionDate,
      e1rm: 0,
      maxWeight: 0,
      sessionVolume: 0
    };

    if (isRmEligible(set)) {
      current.e1rm = Math.max(current.e1rm, getE1rm(set));
    }

    current.maxWeight = Math.max(current.maxWeight, set.weight);
    current.sessionVolume += set.weight * set.reps;
    exerciseHistory.set(set.sessionDate, current);
    grouped.set(set.exerciseName, exerciseHistory);
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([exerciseName, history]) => [
      exerciseName,
      Array.from(history.values()).sort((a, b) => a.date.localeCompare(b.date))
    ])
  );
}

function buildWeeklySummaries(sets: FlatSet[]) {
  const grouped = new Map<
    string,
    {
      trainingDays: Set<string>;
      exercises: Set<string>;
      setCount: number;
      volume: number;
    }
  >();

  for (const set of sets) {
    const weekStart = getMondayWeekStart(set.sessionDate);
    const current = grouped.get(weekStart) ?? {
      trainingDays: new Set<string>(),
      exercises: new Set<string>(),
      setCount: 0,
      volume: 0
    };
    current.trainingDays.add(set.sessionDate);
    current.exercises.add(set.exerciseName);
    current.setCount += 1;
    current.volume += set.weight * set.reps;
    grouped.set(weekStart, current);
  }

  return Array.from(grouped.entries())
    .map(([weekStart, value]) => ({
      weekStart,
      trainingDays: value.trainingDays.size,
      exerciseCount: value.exercises.size,
      setCount: value.setCount,
      volume: value.volume
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function buildBodyPartSummaries(sets: FlatSet[], categoryMap: Map<string, string>) {
  const grouped = new Map<string, BodyPartSummary>();

  for (const set of sets) {
    const categoryName = categoryMap.get(set.exerciseName) ?? "その他";
    const current = grouped.get(categoryName) ?? {
      categoryName,
      setCount: 0,
      volume: 0
    };
    current.setCount += 1;
    current.volume += set.weight * set.reps;
    grouped.set(categoryName, current);
  }

  return Array.from(grouped.values()).sort((a, b) => b.volume - a.volume);
}

function getMaxValue(points: HistoryPoint[], key: "e1rm" | "maxWeight" | "sessionVolume") {
  return Math.max(1, ...points.map((point) => point[key]));
}

function rangeHref(range: ProgressRange, exerciseName: string) {
  const exerciseQuery = exerciseName ? `&exercise=${encodeURIComponent(exerciseName)}` : "";

  return `/progress?range=${range}${exerciseQuery}`;
}

function exerciseHref(range: ProgressRange, exerciseName: string) {
  return `/progress?range=${range}&exercise=${encodeURIComponent(exerciseName)}`;
}

function ProLock({ title }: { title: string }) {
  return (
    <div className="pro-lock">
      <strong>{title}</strong>
      <p>
        Proで全期間の成長グラフ、種目別PR、e1RM推移、週別ボリューム分析を確認できます。
      </p>
      <Link className="button full" href="/pricing">
        Proを見る
      </Link>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function PrCard({
  pr,
  weightUnit
}: {
  pr: ExercisePr;
  weightUnit: WeightUnit;
}) {
  return (
    <article className="progress-card">
      <div className="row">
        <h3>{pr.exerciseName}</h3>
        <span className="status-badge">{pr.lastDate}</span>
      </div>
      <div className="metric-grid">
        <MetricCard
          label="推定1RM PR"
          value={formatDisplayWeight(pr.maxE1rm, weightUnit)}
          sub={`${formatDisplayWeight(pr.maxE1rmWeight, weightUnit)} × ${pr.maxE1rmReps}回`}
        />
        <MetricCard
          label="最高重量"
          value={formatDisplayWeight(pr.maxWeight, weightUnit)}
          sub={pr.maxWeightDate}
        />
        <MetricCard
          label="最高回数セット"
          value={pr.maxReps === null ? "-" : `${pr.maxReps}回`}
          sub={
            pr.maxRepsWeight === null
              ? "候補なし"
              : `${formatDisplayWeight(pr.maxRepsWeight, weightUnit)} / ${pr.maxRepsDate}`
          }
        />
        <MetricCard
          label="最大セットボリューム"
          value={pr.maxVolumeSet === null ? "-" : formatDisplayVolume(pr.maxVolumeSet, weightUnit)}
          sub={
            pr.maxVolumeSetWeight === null
              ? "候補なし"
              : `${formatDisplayWeight(pr.maxVolumeSetWeight, weightUnit)} × ${pr.maxVolumeSetReps}回`
          }
        />
        <MetricCard
          label="最大セッションボリューム"
          value={formatDisplayVolume(pr.maxSessionVolume, weightUnit)}
          sub={pr.maxSessionVolumeDate}
        />
      </div>
    </article>
  );
}

function ChartRows({
  points,
  weightUnit
}: {
  points: HistoryPoint[];
  weightUnit: WeightUnit;
}) {
  const e1rmMax = getMaxValue(points, "e1rm");
  const maxWeightMax = getMaxValue(points, "maxWeight");
  const volumeMax = getMaxValue(points, "sessionVolume");

  if (points.length === 0) {
    return <div className="status">この種目の履歴はまだありません。</div>;
  }

  return (
    <div className="chart-list">
      {points.map((point) => (
        <div className="chart-row" key={point.date}>
          <span>{point.date}</span>
          <div className="chart-bars">
            <div>
              <b>e1RM {formatDisplayWeight(point.e1rm, weightUnit)}</b>
              <i style={{ width: `${Math.max(4, (point.e1rm / e1rmMax) * 100)}%` }} />
            </div>
            <div>
              <b>最高重量 {formatDisplayWeight(point.maxWeight, weightUnit)}</b>
              <i style={{ width: `${Math.max(4, (point.maxWeight / maxWeightMax) * 100)}%` }} />
            </div>
            <div>
              <b>ボリューム {formatDisplayVolume(point.sessionVolume, weightUnit)}</b>
              <i style={{ width: `${Math.max(4, (point.sessionVolume / volumeMax) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function ProgressPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const requestedRange = normalizeRange(firstParam(params.range));
  const selectedExerciseParam = firstParam(params.exercise);

  const [billingResult, fitnessProfileResult, sessionsResult, exercisesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, subscription_status, ai_quota_monthly, ai_quota_used, ai_quota_period")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_fitness_profiles")
      .select("weight_unit")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("workout_sessions")
      .select(
        "id, user_id, session_date, created_at, workout_sets(id, user_id, exercise_name, weight, reps, set_order, set_type, is_assisted)"
      )
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("exercises")
      .select("name, user_id, is_default, exercise_categories(name)")
  ]);

  const billingProfile = (billingResult.data as BillingProfile | null) ?? null;
  const isPro = getEffectivePlan(billingProfile) === "pro";
  const weightUnit = normalizeWeightUnit(fitnessProfileResult.data?.weight_unit);
  const range = isPro ? requestedRange : "30";
  const allSessions = ((sessionsResult.data ?? []) as WorkoutSessionRow[]).filter(
    (session) => session.user_id === user.id
  );
  const allSets = flattenSets(allSessions, user.id);
  const periodSets = isPro
    ? filterSetsByRange(allSets, range)
    : filterSetsByRange(allSets, "30");
  const freeRecentSets = filterSetsByRange(allSets, "30");
  const freeSevenDaySets = allSets.filter((set) => set.sessionDate >= getCutoffDate(7));
  const categoryMap = buildCategoryMap((exercisesResult.data ?? []) as ExerciseRow[], user.id);
  const allPrs = buildPrs(allSets);
  const periodPrs = buildPrs(isPro ? periodSets : freeRecentSets);
  const histories = buildHistories(isPro ? periodSets : freeRecentSets);
  const allExerciseNames = Array.from(
    new Set([...allPrs.map((pr) => pr.exerciseName), ...Object.keys(histories)])
  );
  const selectedExercise =
    selectedExerciseParam && allExerciseNames.includes(selectedExerciseParam)
      ? selectedExerciseParam
      : allExerciseNames[0] ?? "";
  const selectedHistory = histories[selectedExercise] ?? [];
  const visibleHistory = isPro ? selectedHistory : selectedHistory.slice(-3);
  const weeklySummaries = buildWeeklySummaries(isPro ? periodSets : freeSevenDaySets);
  const currentWeek = weeklySummaries[0];
  const bodyPartSummaries = buildBodyPartSummaries(periodSets, categoryMap);
  const summarySets = isPro ? periodSets : freeSevenDaySets;
  const summaryVolume = summarySets.reduce((sum, set) => sum + set.weight * set.reps, 0);
  const summaryTrainingDays = new Set(summarySets.map((set) => set.sessionDate)).size;
  const summaryExerciseCount = new Set(summarySets.map((set) => set.exerciseName)).size;
  const topPr = allPrs.slice().sort((a, b) => b.maxE1rm - a.maxE1rm)[0];
  const visiblePrs = isPro ? allPrs : periodPrs.slice(0, 3);

  return (
    <div className="screen progress-page">
      <header className="screen-header">
        <p className="eyebrow">Progress</p>
        <div className="row">
          <h1>進捗</h1>
          <span className="status-badge">{isPro ? "Pro" : "Free"}</span>
        </div>
        <p className="muted">
          AIを使わず、記録済みデータからPR、推定1RM、週別ボリュームを集計します。
        </p>
      </header>

      {sessionsResult.error ? (
        <div className="status error">{sessionsResult.error.message}</div>
      ) : null}

      <section className="panel">
        <div className="row">
          <h2>{isPro ? "期間サマリー" : "直近7日サマリー"}</h2>
          {isPro ? (
            <div className="range-tabs">
              {([
                ["30", "30日"],
                ["90", "90日"],
                ["all", "全期間"]
              ] as Array<[ProgressRange, string]>).map(([value, label]) => (
                <Link
                  key={value}
                  className={range === value ? "is-active" : ""}
                  href={rangeHref(value, selectedExercise)}
                >
                  {label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="metric-grid">
          <MetricCard label="トレーニング日数" value={`${summaryTrainingDays}日`} />
          <MetricCard label="実施種目" value={`${summaryExerciseCount}種目`} />
          <MetricCard label="総セット数" value={`${summarySets.length}セット`} />
          <MetricCard label="総ボリューム" value={formatDisplayVolume(summaryVolume, weightUnit)} />
        </div>
        {topPr ? (
          <div className="status success">
            最高推定1RMは{topPr.exerciseName}の{formatDisplayWeight(topPr.maxE1rm, weightUnit)}です。
          </div>
        ) : (
          <div className="status">まだ集計できるトレーニング記録がありません。</div>
        )}
      </section>

      <section className="panel">
        <div className="row">
          <h2>種目別PR</h2>
          {!isPro ? <span className="status-badge">一部表示</span> : null}
        </div>
        <div className="stack">
          {visiblePrs.map((pr) => (
            <PrCard key={pr.exerciseName} pr={pr} weightUnit={weightUnit} />
          ))}
        </div>
        {visiblePrs.length === 0 ? (
          <div className="status">PRは、トレーニング記録後に表示されます。</div>
        ) : null}
        {!isPro ? <ProLock title="全期間の種目別PRはProで確認できます" /> : null}
      </section>

      <section className="panel">
        <div className="row">
          <h2>種目別グラフ</h2>
          {!isPro ? <span className="status-badge">直近3回</span> : null}
        </div>
        {allExerciseNames.length ? (
          <>
            <div className="chip-row">
              {allExerciseNames.map((exerciseName) => (
                <Link
                  key={exerciseName}
                  className={
                    exerciseName === selectedExercise
                      ? "chip-link is-selected"
                      : "chip-link"
                  }
                  href={exerciseHref(range, exerciseName)}
                >
                  {exerciseName}
                </Link>
              ))}
            </div>
            <ChartRows points={visibleHistory} weightUnit={weightUnit} />
          </>
        ) : (
          <div className="status">種目別の推移は、トレーニング記録後に表示されます。</div>
        )}
        {!isPro ? <ProLock title="全期間のe1RM履歴と成長グラフはProで解放されます" /> : null}
      </section>

      <section className="panel">
        <div className="row">
          <h2>{isPro ? "週別ボリューム" : "直近7日のボリューム"}</h2>
          {!isPro ? <span className="status-badge">プレビュー</span> : null}
        </div>
        {currentWeek ? (
          <div className="metric-grid">
            <MetricCard label="トレーニング日数" value={`${currentWeek.trainingDays}日`} />
            <MetricCard label="実施種目" value={`${currentWeek.exerciseCount}種目`} />
            <MetricCard label="セット数" value={`${currentWeek.setCount}セット`} />
            <MetricCard label="ボリューム" value={formatDisplayVolume(currentWeek.volume, weightUnit)} />
          </div>
        ) : null}
        <div className="progress-list">
          {weeklySummaries.slice(0, isPro ? 12 : 2).map((week) => (
            <div className="progress-line" key={week.weekStart}>
              <span>{week.weekStart}週</span>
              <strong>
                {formatDisplayVolume(week.volume, weightUnit)} / {week.setCount}セット
              </strong>
            </div>
          ))}
        </div>
        {weeklySummaries.length === 0 ? (
          <div className="status">週別ボリュームは、トレーニング記録後に表示されます。</div>
        ) : null}
        {!isPro ? <ProLock title="週別ボリューム推移はProで確認できます" /> : null}
      </section>

      <section className="panel">
        <div className="row">
          <h2>部位別集計</h2>
          {!isPro ? <span className="status-badge">Pro限定</span> : null}
        </div>
        {isPro ? (
          <div className="progress-list">
            {bodyPartSummaries.map((summary) => (
              <div className="progress-line" key={summary.categoryName}>
                <span>{summary.categoryName}</span>
                <strong>
                  {summary.setCount}セット / {formatDisplayVolume(summary.volume, weightUnit)}
                </strong>
              </div>
            ))}
            {bodyPartSummaries.length === 0 ? (
              <div className="status">部位別集計は、トレーニング記録後に表示されます。</div>
            ) : null}
          </div>
        ) : (
          <ProLock title="部位別セット数・ボリュームはProで確認できます" />
        )}
      </section>
    </div>
  );
}
