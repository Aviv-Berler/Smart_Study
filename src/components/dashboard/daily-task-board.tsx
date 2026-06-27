"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useOptimistic,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Check, Circle, Clock, Target, Sparkles, Timer } from "lucide-react";
import { completeDailyGoal, setLoggedWorkMinutes } from "@/app/actions/daily-goals";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { todayDateString } from "@/lib/drift-detection";
import { generateTimePresets } from "@/lib/time-presets";
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

const MENU_SIDE_OFFSET = 6;
const MENU_VIEWPORT_PADDING = 8;
const MENU_MIN_WIDTH = 168;

type MenuAlign = "start" | "end";

function getMenuAlign(): MenuAlign {
  return window.matchMedia("(min-width: 640px)").matches ? "end" : "start";
}

function isDocumentRtl(): boolean {
  return (
    document.documentElement.getAttribute("dir") === "rtl" ||
    getComputedStyle(document.documentElement).direction === "rtl"
  );
}

function computeMenuLeft(triggerRect: DOMRect, menuWidth: number, align: MenuAlign): number {
  const rtl = isDocumentRtl();
  const left =
    align === "start"
      ? rtl
        ? triggerRect.right - menuWidth
        : triggerRect.left
      : rtl
        ? triggerRect.left
        : triggerRect.right - menuWidth;

  return Math.max(
    MENU_VIEWPORT_PADDING,
    Math.min(left, window.innerWidth - menuWidth - MENU_VIEWPORT_PADDING),
  );
}

function computeMenuTop(triggerRect: DOMRect, menuHeight: number): number {
  const below = triggerRect.bottom + MENU_SIDE_OFFSET;
  if (below + menuHeight <= window.innerHeight - MENU_VIEWPORT_PADDING) {
    return below;
  }

  const above = triggerRect.top - menuHeight - MENU_SIDE_OFFSET;
  if (above >= MENU_VIEWPORT_PADDING) {
    return above;
  }

  return Math.max(
    MENU_VIEWPORT_PADDING,
    window.innerHeight - menuHeight - MENU_VIEWPORT_PADDING,
  );
}

function TimeLoggerPopover({
  goal,
  onLogMinutes,
}: {
  goal: DailyGoalTableRow;
  onLogMinutes: (minutes: number) => void;
}) {
  const { translate, locale } = useLanguage();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);

  const logged = goal.actualMinutesSpent;
  const hasLogged = logged > 0;
  const presets = useMemo(
    () => generateTimePresets(goal.targetMinutes, locale),
    [goal.targetMinutes, locale],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? MENU_MIN_WIDTH;
    const menuHeight = menuRef.current?.offsetHeight ?? 240;
    const align = getMenuAlign();

    setMenuCoords({
      top: computeMenuTop(triggerRect, menuHeight),
      left: computeMenuLeft(triggerRect, menuWidth, align),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuCoords(null);
      return;
    }

    updateMenuPosition();
    const raf = requestAnimationFrame(updateMenuPosition);

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition, presets]);

  useEffect(() => {
    if (!flashSuccess) return;
    const id = window.setTimeout(() => setFlashSuccess(false), 700);
    return () => window.clearTimeout(id);
  }, [flashSuccess]);

  const handleSelect = (minutes: number) => {
    onLogMinutes(minutes);
    setFlashSuccess(true);
    setOpen(false);
  };

  const menuPortal =
    mounted && open
      ? createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[49] cursor-default bg-transparent"
              aria-label={translate("closeMenu")}
              onClick={() => setOpen(false)}
            />
            <div
              ref={menuRef}
              role="menu"
              className={cn(
                "fixed z-50 min-w-[10.5rem] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg",
                !menuCoords && "pointer-events-none opacity-0",
              )}
              style={
                menuCoords
                  ? { top: menuCoords.top, left: menuCoords.left }
                  : { top: 0, left: -9999 }
              }
              onClick={(e) => e.stopPropagation()}
            >
              {presets.map((preset) => (
                <button
                  key={preset.percent}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(preset.minutes)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                    "hover:bg-muted/80 active:bg-muted",
                    logged === preset.minutes &&
                      preset.minutes > 0 &&
                      "bg-emerald-500/10 font-medium text-emerald-800 dark:text-emerald-300",
                    preset.percent === 0 && "text-muted-foreground",
                  )}
                >
                  {preset.percent === 0 ? (
                    <span className="w-full">{preset.label}</span>
                  ) : (
                    <>
                      <span>{preset.percent}%</span>
                      <LtrIsolate className="text-xs text-muted-foreground">{preset.label}</LtrIsolate>
                    </>
                  )}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-tight",
          "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "sm:max-w-none sm:text-xs",
          flashSuccess && "scale-[1.02] ring-2 ring-emerald-400/60",
          hasLogged
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 shadow-sm dark:text-emerald-200"
            : "border-border/80 bg-muted/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground",
        )}
      >
        {hasLogged ? (
          <>
            <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">
              {translate("loggedWorkTimePrefix")}{" "}
              <LtrIsolate>{formatMinutes(logged)}</LtrIsolate>{" "}
              {translate("loggedWorkTimeUpdateSuffix")}
            </span>
          </>
        ) : (
          <>
            <Timer className="h-3 w-3 shrink-0 opacity-70" />
            <span className="truncate">{translate("logWorkTime")}</span>
          </>
        )}
      </button>

      {menuPortal}
    </div>
  );
}

function TaskRow({
  goal,
  onLogMinutes,
  onToggleComplete,
}: {
  goal: DailyGoalTableRow;
  onLogMinutes: (minutes: number) => void;
  onToggleComplete: () => void;
}) {
  const { translate } = useLanguage();
  const targetPct = goal.cumulativeTargetPct;
  const hasLoggedTime = goal.actualMinutesSpent > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5 transition-colors sm:flex-nowrap sm:gap-3",
        hasLoggedTime && "bg-muted/25",
      )}
    >
      <TimeLoggerPopover goal={goal} onLogMinutes={onLogMinutes} />

      <span className="min-w-0 flex-1 basis-[40%] sm:basis-auto">
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
          <AutoDirText className="min-w-0 break-words sm:truncate">{goal.taskTitle}</AutoDirText>
          <PercentValue value={targetPct} className="shrink-0 text-xs font-bold text-primary" />
        </span>
        {goal.courseName && (
          <span className="flex flex-row items-center gap-1 text-[11px] text-muted-foreground">
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
          "ms-auto shrink-0 rounded-full p-0.5 transition-all duration-200 sm:ms-0",
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

  const logWorkMinutes = (goal: DailyGoalTableRow, minutes: number) => {
    const absoluteMinutes = Math.max(0, Math.round(minutes));
    const goalKey = goal.goalId ?? goal.taskId;
    const timeLogged = absoluteMinutes > 0;

    patchGoalRecord(
      goal.taskId,
      { actualMinutesSpent: absoluteMinutes, timeLogged },
      todayStr,
    );

    startTransition(() => {
      updateOptimistic({
        goalId: goalKey,
        patch: { actualMinutesSpent: absoluteMinutes, timeLogged },
      });

      void (async () => {
        const result = await setLoggedWorkMinutes(
          goal.taskId,
          absoluteMinutes,
          todayStr,
          goal.targetMinutes,
        );

        if (result.error) {
          patchGoalRecord(
            goal.taskId,
            {
              actualMinutesSpent: goal.actualMinutesSpent,
              timeLogged: goal.actualMinutesSpent > 0,
            },
            todayStr,
          );
          startTransition(() => {
            updateOptimistic({
              goalId: goalKey,
              patch: {
                actualMinutesSpent: goal.actualMinutesSpent,
                timeLogged: goal.actualMinutesSpent > 0,
              },
            });
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
  const timeLoggedCount = optimisticGoals.filter((g) => g.actualMinutesSpent > 0).length;

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
                onLogMinutes={(minutes) => logWorkMinutes(goal, minutes)}
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
