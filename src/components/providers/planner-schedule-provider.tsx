"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  computeUpcomingMilestones,
  liveGoalEntriesToTableRows,
  mergeWeekProgressBlocks,
  normalizeCalendarBlock,
  type GoalRecord,
  type UpcomingMilestoneItem,
} from "@/lib/planner-goals";
import type { CalendarBlock, DailyGoalTableRow, Task } from "@/types/database";

export type { ScheduleGoalRecord };

interface PlannerScheduleContextValue {
  loaded: boolean;
  todayTableRows: DailyGoalTableRow[];
  upcomingMilestones: UpcomingMilestoneItem[];
  goalRecords: Map<string, GoalRecord>;
  sessionLoggedKeys: string[];
  fullyCompletedGoalKeys: string[];
  completedGoalKeys: string[];
  progressBlocks: CalendarBlock[];
  applyWeekData: (data: {
    blocks:                   CalendarBlock[];
    progressBlocks:           CalendarBlock[];
    tasks:                    Task[];
    completedGoalKeys:        string[];
    sessionLoggedKeys:        string[];
    fullyCompletedGoalKeys:   string[];
    hasDraftBlocks:           boolean;
    goalRecords:              ScheduleGoalRecord[];
  }) => void;
  syncGoalMetadata: (data: {
    completedGoalKeys:      string[];
    sessionLoggedKeys:      string[];
    fullyCompletedGoalKeys: string[];
    goalRecords:            ScheduleGoalRecord[];
  }) => void;
  syncBlocks: (
    blocks:            CalendarBlock[],
    hasDraftBlocks:    boolean,
    completedGoalKeys: string[],
    weekStart:         string,
    weekEnd:           string,
  ) => void;
  patchGoalRecord: (taskId: string, patch: Partial<GoalRecord>, goalDate?: string) => void;
  patchTask: (taskId: string, patch: Partial<Task>) => void;
  tasks: Task[];
  ensureLoaded: () => Promise<void>;
  refreshSchedule: () => Promise<void>;
}

const PlannerScheduleContext = createContext<PlannerScheduleContextValue | null>(null);

function goalRecordsToMap(records: ScheduleGoalRecord[]): Map<string, GoalRecord> {
  return new Map(
    records.map((r) => [
      goalCompletionKey(r.taskId, r.goalDate),
      {
        goalId:                   r.goalId,
        timeLogged:               r.timeLogged,
        actualMinutesSpent:       r.actualMinutesSpent,
        isFullyCompleted:         r.isFullyCompleted,
        baselineProgressSnapshot: r.baselineProgressSnapshot,
      },
    ]),
  );
}

function unionKeys(session: string[], fully: string[]): string[] {
  return [...new Set([...session, ...fully])];
}

export function PlannerScheduleProvider({ children }: { children: React.ReactNode }) {
  const [blocks, setBlocks]                         = useState<CalendarBlock[]>([]);
  const [progressBlocks, setProgressBlocks]         = useState<CalendarBlock[]>([]);
  const [tasks, setTasks]                           = useState<Task[]>([]);
  const [completedGoalKeys, setCompletedGoalKeys]     = useState<string[]>([]);
  const [sessionLoggedKeys, setSessionLoggedKeys]     = useState<string[]>([]);
  const [fullyCompletedGoalKeys, setFullyCompletedGoalKeys] = useState<string[]>([]);
  const [hasDraftBlocks, setHasDraftBlocks]         = useState(false);
  const [goalRecords, setGoalRecords]               = useState<Map<string, GoalRecord>>(new Map());
  const [loaded, setLoaded]                         = useState(false);
  const [todayKey, setTodayKey]                     = useState(() => todayDateString());

  const loadingRef = useRef(false);
  const todayKeyRef = useRef(todayKey);
  const pendingTaskPatchesRef = useRef<Map<string, Partial<Task>>>(new Map());

  const mergeTasksFromServer = useCallback((incoming: Task[], prev: Task[]): Task[] => {
    if (pendingTaskPatchesRef.current.size === 0 && prev.length === 0) return incoming;

    const prevById = new Map(prev.map((t) => [t.id, t]));

    return incoming.map((t) => {
      const pending = pendingTaskPatchesRef.current.get(t.id);
      const local = prevById.get(t.id);
      if (!pending && !local) return t;

      const merged = { ...t, ...(local ?? {}), ...(pending ?? {}) };

      if (pending) {
        const caughtUp = (Object.keys(pending) as (keyof Task)[]).every(
          (key) => t[key] === merged[key],
        );
        if (caughtUp) pendingTaskPatchesRef.current.delete(t.id);
      }

      return merged;
    });
  }, []);

  const applyWeekData = useCallback((data: {
    blocks:                 CalendarBlock[];
    progressBlocks:         CalendarBlock[];
    tasks:                  Task[];
    completedGoalKeys:      string[];
    sessionLoggedKeys:      string[];
    fullyCompletedGoalKeys: string[];
    hasDraftBlocks:         boolean;
    goalRecords:            ScheduleGoalRecord[];
  }) => {
    setBlocks(data.blocks.map(normalizeCalendarBlock));
    setProgressBlocks(data.progressBlocks.map(normalizeCalendarBlock));
    setTasks((prev) => mergeTasksFromServer(data.tasks, prev));
    setSessionLoggedKeys(data.sessionLoggedKeys);
    setFullyCompletedGoalKeys(data.fullyCompletedGoalKeys);
    setCompletedGoalKeys(data.completedGoalKeys);
    setHasDraftBlocks(data.hasDraftBlocks);
    setGoalRecords(goalRecordsToMap(data.goalRecords));
    setLoaded(true);
  }, [mergeTasksFromServer]);

  const syncGoalMetadata = useCallback((data: {
    completedGoalKeys:      string[];
    sessionLoggedKeys:      string[];
    fullyCompletedGoalKeys: string[];
    goalRecords:            ScheduleGoalRecord[];
  }) => {
    setSessionLoggedKeys(data.sessionLoggedKeys);
    setFullyCompletedGoalKeys(data.fullyCompletedGoalKeys);
    setCompletedGoalKeys(data.completedGoalKeys);
    setGoalRecords(goalRecordsToMap(data.goalRecords));
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

  const refreshSchedule = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { weekStart, weekEnd } = getWeekBounds(todayKeyRef.current);
      const data = await loadPlannerWeekData(weekStart, weekEnd);
      applyWeekData({
        blocks:                 data.calendarBlocks,
        progressBlocks:         data.progressBlocks,
        tasks:                  data.tasks,
        completedGoalKeys:      data.completedGoalKeys,
        sessionLoggedKeys:      data.sessionLoggedKeys,
        fullyCompletedGoalKeys: data.fullyCompletedGoalKeys,
        hasDraftBlocks:         data.hasDraftBlocks,
        goalRecords:            data.goalRecords,
      });
    } finally {
      loadingRef.current = false;
    }
  }, [applyWeekData]);

  const patchGoalRecord = useCallback((
    taskId: string,
    patch: Partial<GoalRecord>,
    goalDate: string = todayKeyRef.current,
  ) => {
    let updated: GoalRecord | null = null;
    const mapKey = goalCompletionKey(taskId, goalDate);

    setGoalRecords((prev) => {
      const next = new Map(prev);
      const existing = next.get(mapKey) ?? {
        goalId:                   null,
        timeLogged:               false,
        actualMinutesSpent:       0,
        isFullyCompleted:         false,
        baselineProgressSnapshot: null,
      };
      const merged = { ...existing, ...patch };
      if (patch.actualMinutesSpent !== undefined) {
        merged.timeLogged = patch.actualMinutesSpent > 0;
      }
      updated = merged;
      next.set(mapKey, updated);
      return next;
    });

    if (patch.timeLogged !== undefined || patch.actualMinutesSpent !== undefined) {
      setSessionLoggedKeys((keys) => {
        const set = new Set(keys);
        const logged = updated?.actualMinutesSpent
          ? updated.actualMinutesSpent > 0
          : updated?.timeLogged;
        if (logged) set.add(mapKey);
        else set.delete(mapKey);
        return [...set];
      });
    }

    if (patch.isFullyCompleted !== undefined) {
      setFullyCompletedGoalKeys((keys) => {
        const set = new Set(keys);
        if (patch.isFullyCompleted) set.add(mapKey);
        else set.delete(mapKey);
        return [...set];
      });
    }

    if (
      patch.timeLogged !== undefined ||
      patch.actualMinutesSpent !== undefined ||
      patch.isFullyCompleted !== undefined
    ) {
      setCompletedGoalKeys((keys) => {
        const set = new Set(keys);
        const logged = (updated?.actualMinutesSpent ?? 0) > 0 || updated?.timeLogged;
        if (logged || updated?.isFullyCompleted) set.add(mapKey);
        else set.delete(mapKey);
        return [...set];
      });
    }
  }, []);

  const patchTask = useCallback((taskId: string, patch: Partial<Task>) => {
    const existing = pendingTaskPatchesRef.current.get(taskId) ?? {};
    pendingTaskPatchesRef.current.set(taskId, { ...existing, ...patch });
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    );
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    await refreshSchedule();
  }, [loaded, refreshSchedule]);

  useEffect(() => {
    const tick = () => {
      const next = todayDateString();
      if (next === todayKeyRef.current) return;
      todayKeyRef.current = next;
      setTodayKey(next);
      void refreshSchedule();
    };

    const id = window.setInterval(tick, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshSchedule]);

  const completedGoals = useMemo(
    () => new Set(completedGoalKeys),
    [completedGoalKeys],
  );

  const sessionLogged = useMemo(
    () => new Set(sessionLoggedKeys),
    [sessionLoggedKeys],
  );

  const fullyCompleted = useMemo(
    () => new Set(fullyCompletedGoalKeys),
    [fullyCompletedGoalKeys],
  );

  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [String(t.id).trim(), t])),
    [tasks],
  );

  const hasDraftLocal = blocks.some((b) => b.kind === "ai" && !b.is_locked);
  const hasDrafts     = hasDraftBlocks || hasDraftLocal;

  const timelineBlocks = useMemo(
    () => buildTimelineBlocks(blocks, hasDrafts, todayKey, completedGoals, isMissedBlock),
    [blocks, hasDrafts, todayKey, completedGoals],
  );

  const todayTableRows = useMemo(() => {
    const dayRows = computeLiveDailyGoals(
      [todayKey],
      timelineBlocks,
      progressBlocks,
      tasksById,
      sessionLogged,
      fullyCompleted,
      completedGoals,
      todayKey,
    );
    const entries = dayRows[0] ?? [];
    return liveGoalEntriesToTableRows(entries, tasksById, goalRecords, todayKey);
  }, [
    todayKey,
    timelineBlocks,
    progressBlocks,
    tasksById,
    sessionLogged,
    fullyCompleted,
    completedGoals,
    goalRecords,
  ]);

  const upcomingMilestones = useMemo(
    () => computeUpcomingMilestones(tasks, todayKey),
    [tasks, todayKey],
  );

  const value = useMemo(
    () => ({
      loaded,
      todayTableRows,
      upcomingMilestones,
      goalRecords,
      sessionLoggedKeys,
      fullyCompletedGoalKeys,
      completedGoalKeys,
      progressBlocks,
      applyWeekData,
      syncGoalMetadata,
      syncBlocks,
      patchGoalRecord,
      patchTask,
      tasks,
      ensureLoaded,
      refreshSchedule,
    }),
    [
      loaded,
      todayTableRows,
      upcomingMilestones,
      goalRecords,
      sessionLoggedKeys,
      fullyCompletedGoalKeys,
      completedGoalKeys,
      progressBlocks,
      applyWeekData,
      syncGoalMetadata,
      syncBlocks,
      patchGoalRecord,
      patchTask,
      tasks,
      ensureLoaded,
      refreshSchedule,
    ],
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
