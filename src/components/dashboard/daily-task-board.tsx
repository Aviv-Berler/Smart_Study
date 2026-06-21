"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { CheckCircle2, Circle, Clock, Target, Sparkles } from "lucide-react";
import { completeDailyGoal, logTimeSession } from "@/app/actions/daily-goals";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { todayDateString } from "@/lib/drift-detection";
import {
  AutoDirText,
  FractionCounter,
  LtrIsolate,
  PercentValue,
} from "@/components/ui/bidi-text";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatMinutes } from "@/lib/utils";
import type { DailyGoalTableRow } from "@/types/database";

interface DailyTaskBoardProps {
  goals: DailyGoalTableRow[];
}

function TaskRow({
  goal,
  onToggleTime,
  onToggleComplete,
}: {
  goal: DailyGoalTableRow;
  onToggleTime: () => void;
  onToggleComplete: () => void;
}) {
  const { translate } = useLanguage();

  const targetPct = goal.cumulativeTargetPct;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 transition-colors",
        goal.timeLogged && "bg-muted/25",
      )}
    >
      <button
        type="button"
        onClick={onToggleTime}
        aria-label={translate("markSessionDone")}
        aria-pressed={goal.timeLogged}
        title={translate("markSessionDone")}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
          "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          goal.timeLogged
            ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-emerald-900/40"
            : "border-border bg-muted/60 text-muted-foreground hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 dark:hover:text-emerald-300",
        )}
      >
        <Clock className="h-3 w-3" />
        <LtrIsolate>{formatMinutes(goal.targetMinutes)}</LtrIsolate>
      </button>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "flex flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium leading-snug transition-colors",
            goal.isFullyCompleted
              ? "text-muted-foreground/60 line-through decoration-muted-foreground/40"
              : "text-foreground",
          )}
        >
          <span className="shrink-0 text-xs font-semibold text-primary">
            {translate("targetForToday")}:
          </span>
          <AutoDirText className="min-w-0 truncate">{goal.taskTitle}</AutoDirText>
          <PercentValue value={targetPct} className="shrink-0 text-xs font-bold text-primary" />
        </span>
        {goal.courseName && (
          <span className="flex flex-row items-center gap-1 truncate text-[11px] text-muted-foreground">
            <AutoDirText className="truncate">{goal.courseName}</AutoDirText>
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={onToggleComplete}
        aria-label={translate("markTaskDone")}
        aria-pressed={goal.isFullyCompleted}
        title={translate("markTaskDone")}
        className={cn(
          "shrink-0 rounded-full p-0.5 transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          goal.isFullyCompleted
            ? "text-primary"
            : "text-muted-foreground/40 hover:text-primary/70",
        )}
      >
        {goal.isFullyCompleted ? (
          <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
        ) : (
          <Circle className="h-5 w-5" strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}

export function DailyTaskBoard({ goals }: DailyTaskBoardProps) {
  const { translate } = useLanguage();
  const { patchGoalRecord, refreshSchedule } = usePlannerSchedule();
  const [, startTransition] = useTransition();
  const todayStr = todayDateString();

  const [optimisticGoals, updateOptimistic] = useOptimistic(
    goals,
    (
      state: DailyGoalTableRow[],
      update: { goalId: string; patch: Partial<DailyGoalTableRow> },
    ) =>
      state.map((g) =>
        g.goalId === update.goalId || g.taskId === update.goalId
          ? { ...g, ...update.patch }
          : g,
      ),
  );

  const toggleTime = (goal: DailyGoalTableRow) => {
    const next = !goal.timeLogged;
    const goalKey = goal.goalId ?? goal.taskId;

    patchGoalRecord(goal.taskId, { timeLogged: next }, todayStr);

    startTransition(() => {
      updateOptimistic({ goalId: goalKey, patch: { timeLogged: next } });

      void (async () => {
        const result = await logTimeSession(
          goal.taskId,
          next,
          todayStr,
          goal.targetMinutes,
        );

        if (result.error) {
          patchGoalRecord(goal.taskId, { timeLogged: !next }, todayStr);
          startTransition(() => {
            updateOptimistic({ goalId: goalKey, patch: { timeLogged: !next } });
          });
          return;
        }

        void refreshSchedule();
      })();
    });
  };

  const toggleComplete = (goal: DailyGoalTableRow) => {
    if (!goal.goalId) return;
    const next = !goal.isFullyCompleted;

    patchGoalRecord(goal.taskId, { isFullyCompleted: next }, todayStr);

    startTransition(() => {
      updateOptimistic({
        goalId: goal.goalId!,
        patch: {
          isFullyCompleted: next,
          registryProgressPct: next
            ? goal.cumulativeTargetPct
            : goal.registryProgressPct,
        },
      });

      void (async () => {
        const result = await completeDailyGoal(
          goal.goalId!,
          next,
          next
            ? {
                baselineProgressPct: goal.registryProgressPct,
                targetProgressPct: goal.cumulativeTargetPct,
              }
            : undefined,
        );

        if (result.error) {
          patchGoalRecord(goal.taskId, { isFullyCompleted: !next }, todayStr);
          startTransition(() => {
            updateOptimistic({
              goalId: goal.goalId!,
              patch: {
                isFullyCompleted: !next,
                registryProgressPct: goal.registryProgressPct,
              },
            });
          });
          return;
        }

        void refreshSchedule();
      })();
    });
  };

  const fullyDoneCount = optimisticGoals.filter((g) => g.isFullyCompleted).length;
  const timeLoggedCount = optimisticGoals.filter((g) => g.timeLogged).length;

  return (
    <section className="space-y-3" data-tour="daily-task-board">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("dailyTaskBoard")}</h2>
        </div>
        {optimisticGoals.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-emerald-500" />
              <FractionCounter numerator={timeLoggedCount} denominator={optimisticGoals.length} />
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <FractionCounter numerator={fullyDoneCount} denominator={optimisticGoals.length} />
            </span>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {optimisticGoals.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {translate("noDailyTasks")}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {translate("plannerLinkHint")}{" "}
              <Link href="/planner" prefetch className="font-semibold text-primary hover:underline">
                {translate("smartPlannerLink")}
              </Link>{" "}
              {translate("plannerLinkSuffix")}
            </p>
          </CardContent>
        ) : (
          <CardContent className="divide-y divide-border p-1">
            {optimisticGoals.map((goal) => (
              <TaskRow
                key={goal.goalId ?? goal.taskId}
                goal={goal}
                onToggleTime={() => toggleTime(goal)}
                onToggleComplete={() => toggleComplete(goal)}
              />
            ))}
          </CardContent>
        )}
      </Card>

      {optimisticGoals.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-emerald-500" />
            {translate("pillLegend")}
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-primary" />
            {translate("circleLegend")}
          </span>
        </p>
      )}
    </section>
  );
}
