"use client";

import { useEffect, useRef } from "react";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import type { ScheduleGoalRecord } from "@/app/actions/planner";
import type { CalendarBlock, Task } from "@/types/database";

export function ScheduleHydrator({
  blocks,
  progressBlocks,
  tasks,
  completedGoalKeys,
  hasDraftBlocks,
  goalRecords,
  children,
}: {
  blocks:            CalendarBlock[];
  progressBlocks:    CalendarBlock[];
  tasks:             Task[];
  completedGoalKeys: string[];
  hasDraftBlocks:    boolean;
  goalRecords:       ScheduleGoalRecord[];
  children:          React.ReactNode;
}) {
  const { applyWeekData } = usePlannerSchedule();
  const didHydrateFromSsr = useRef(false);

  useEffect(() => {
    if (didHydrateFromSsr.current) return;
    didHydrateFromSsr.current = true;
    applyWeekData({
      blocks,
      progressBlocks,
      tasks,
      completedGoalKeys,
      hasDraftBlocks,
      goalRecords,
    });
  }, [applyWeekData, blocks, progressBlocks, tasks, completedGoalKeys, hasDraftBlocks, goalRecords]);

  return <>{children}</>;
}
