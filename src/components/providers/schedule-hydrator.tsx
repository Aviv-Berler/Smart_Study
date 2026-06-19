"use client";

import { useEffect } from "react";
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
  const { applyWeekData, loaded } = usePlannerSchedule();

  useEffect(() => {
    if (!loaded) {
      applyWeekData({
        blocks,
        progressBlocks,
        tasks,
        completedGoalKeys,
        hasDraftBlocks,
        goalRecords,
      });
    }
  }, [loaded, blocks, progressBlocks, tasks, completedGoalKeys, hasDraftBlocks, goalRecords, applyWeekData]);

  return <>{children}</>;
}
