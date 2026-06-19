"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadPlannerWeekData, type ScheduleGoalRecord } from "@/app/actions/planner";
import { isMissedBlock, goalCompletionKey, todayDateString } from "@/lib/drift-detection";
import { getWeekBounds } from "@/lib/plan-horizon";
import {
  buildTimelineBlocks,
  computeLiveDailyGoals,
  liveGoalEntriesToTableRows,
  mergeWeekProgressBlocks,
  normalizeCalendarBlock,
  type GoalRecord,
} from "@/lib/planner-goals";
import type { CalendarBlock, DailyGoalTableRow, Task } from "@/types/database";

export type { ScheduleGoalRecord };

interface PlannerScheduleContextValue {
  loaded: boolean;
  todayTableRows: DailyGoalTableRow[];
  /** Full lifecycle blocks — required for absolute cumulative target math */
  progressBlocks: CalendarBlock[];
  applyWeekData: (data: {
    blocks:            CalendarBlock[];
    progressBlocks:    CalendarBlock[];
    tasks:             Task[];
    completedGoalKeys: string[];
    hasDraftBlocks:    boolean;
    goalRecords:       ScheduleGoalRecord[];
  }) => void;
  syncBlocks: (
    blocks:            CalendarBlock[],
    hasDraftBlocks:    boolean,
    completedGoalKeys: string[],
    weekStart:         string,
    weekEnd:           string,
  ) => void;
  patchGoalRecord: (taskId: string, patch: Partial<GoalRecord>) => void;
  ensureLoaded: () => Promise<void>;
}

const PlannerScheduleContext = createContext<PlannerScheduleContextValue | null>(null);

function goalRecordsToMap(records: ScheduleGoalRecord[]): Map<string, GoalRecord> {
  return new Map(records.map((r) => [r.taskId, r]));
}

export function PlannerScheduleProvider({ children }: { children: React.ReactNode }) {
  const [blocks, setBlocks]                       = useState<CalendarBlock[]>([]);
  const [progressBlocks, setProgressBlocks]       = useState<CalendarBlock[]>([]);
  const [tasks, setTasks]                         = useState<Task[]>([]);
  const [completedGoalKeys, setCompletedGoalKeys]   = useState<string[]>([]);
  const [hasDraftBlocks, setHasDraftBlocks]       = useState(false);
  const [goalRecords, setGoalRecords]             = useState<Map<string, GoalRecord>>(new Map());
  const [loaded, setLoaded]                       = useState(false);

  const loadingRef = useRef(false);

  const applyWeekData = useCallback((data: {
    blocks:            CalendarBlock[];
    progressBlocks:    CalendarBlock[];
    tasks:             Task[];
    completedGoalKeys: string[];
    hasDraftBlocks:    boolean;
    goalRecords:       ScheduleGoalRecord[];
  }) => {
    setBlocks(data.blocks.map(normalizeCalendarBlock));
    setProgressBlocks(data.progressBlocks.map(normalizeCalendarBlock));
    setTasks(data.tasks);
    setCompletedGoalKeys(data.completedGoalKeys);
    setHasDraftBlocks(data.hasDraftBlocks);
    setGoalRecords(goalRecordsToMap(data.goalRecords));
    setLoaded(true);
  }, []);

  const syncBlocks = useCallback((
    nextBlocks: CalendarBlock[],
    nextHasDraftBlocks: boolean,
    nextCompletedGoalKeys: string[],
    weekStart: string,
    weekEnd: string,
  ) => {
    setBlocks(nextBlocks.map(normalizeCalendarBlock));
    setProgressBlocks((prev) =>
      mergeWeekProgressBlocks(prev, nextBlocks, weekStart, weekEnd),
    );
    setHasDraftBlocks(nextHasDraftBlocks);
    setCompletedGoalKeys(nextCompletedGoalKeys);
    setLoaded(true);
  }, []);

  const patchGoalRecord = useCallback((taskId: string, patch: Partial<GoalRecord>) => {
    let updated: GoalRecord | null = null;

    setGoalRecords((prev) => {
      const next = new Map(prev);
      const existing = next.get(taskId) ?? {
        goalId: null,
        timeLogged: false,
        isFullyCompleted: false,
      };
      updated = { ...existing, ...patch };
      next.set(taskId, updated);
      return next;
    });

    if (patch.timeLogged !== undefined || patch.isFullyCompleted !== undefined) {
      setCompletedGoalKeys((keys) => {
        if (!updated) return keys;
        const set = new Set(keys);
        const key = goalCompletionKey(taskId, todayDateString());
        if (updated.timeLogged || updated.isFullyCompleted) set.add(key);
        else set.delete(key);
        return [...set];
      });
    }
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const todayStr = todayDateString();
      const { weekStart, weekEnd } = getWeekBounds(todayStr);
      const data = await loadPlannerWeekData(weekStart, weekEnd);
      applyWeekData({
        blocks:            data.calendarBlocks,
        progressBlocks:    data.progressBlocks,
        tasks:             data.tasks,
        completedGoalKeys: data.completedGoalKeys,
        hasDraftBlocks:    data.hasDraftBlocks,
        goalRecords:       data.goalRecords,
      });
    } finally {
      loadingRef.current = false;
    }
  }, [applyWeekData, loaded]);

  const todayStr = todayDateString();

  const completedGoals = useMemo(
    () => new Set(completedGoalKeys),
    [completedGoalKeys],
  );

  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [String(t.id).trim(), t])),
    [tasks],
  );

  const hasDraftLocal = blocks.some((b) => b.kind === "ai" && !b.is_locked);
  const hasDrafts     = hasDraftBlocks || hasDraftLocal;

  const timelineBlocks = useMemo(
    () => buildTimelineBlocks(blocks, hasDrafts, todayStr, completedGoals, isMissedBlock),
    [blocks, hasDrafts, todayStr, completedGoals],
  );

  const todayTableRows = useMemo(() => {
    const dayRows = computeLiveDailyGoals(
      [todayStr],
      timelineBlocks,
      progressBlocks,
      tasksById,
      completedGoals,
      todayStr,
    );
    const entries = dayRows[0] ?? [];
    return liveGoalEntriesToTableRows(entries, tasksById, goalRecords);
  }, [todayStr, timelineBlocks, progressBlocks, tasksById, completedGoals, goalRecords]);

  const value = useMemo(
    () => ({
      loaded,
      todayTableRows,
      progressBlocks,
      applyWeekData,
      syncBlocks,
      patchGoalRecord,
      ensureLoaded,
    }),
    [loaded, todayTableRows, progressBlocks, applyWeekData, syncBlocks, patchGoalRecord, ensureLoaded],
  );

  return (
    <PlannerScheduleContext.Provider value={value}>
      {children}
    </PlannerScheduleContext.Provider>
  );
}

export function usePlannerSchedule() {
  const ctx = useContext(PlannerScheduleContext);
  if (!ctx) {
    throw new Error("usePlannerSchedule must be used within PlannerScheduleProvider");
  }
  return ctx;
}
