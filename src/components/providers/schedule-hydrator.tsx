"use client";

import { useEffect, useRef } from "react";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import type { ScheduleGoalRecord } from "@/app/actions/planner";
import type { CalendarBlock, Task } from "@/types/database";

function goalFingerprint(
  completedGoalKeys: string[],
  sessionLoggedKeys: string[],
  fullyCompletedGoalKeys: string[],
  goalRecords: ScheduleGoalRecord[],
): string {
  return JSON.stringify({
    completedGoalKeys,
    sessionLoggedKeys,
    fullyCompletedGoalKeys,
    goalRecords,
  });
}

export function ScheduleHydrator({
  blocks,
  progressBlocks,
  tasks,
  completedGoalKeys,
  sessionLoggedKeys,
  fullyCompletedGoalKeys,
  hasDraftBlocks,
  goalRecords,
  children,
}: {
  blocks:                 CalendarBlock[];
  progressBlocks:         CalendarBlock[];
  tasks:                  Task[];
  completedGoalKeys:      string[];
  sessionLoggedKeys:      string[];
  fullyCompletedGoalKeys: string[];
  hasDraftBlocks:         boolean;
  goalRecords:            ScheduleGoalRecord[];
  children:               React.ReactNode;
}) {
  const { applyWeekData, syncGoalMetadata } = usePlannerSchedule();
  const lastFingerprint = useRef<string | null>(null);

  useEffect(() => {
    const fingerprint = goalFingerprint(
      completedGoalKeys,
      sessionLoggedKeys,
      fullyCompletedGoalKeys,
      goalRecords,
    );

    if (lastFingerprint.current === null) {
      lastFingerprint.current = fingerprint;
      applyWeekData({
        blocks,
        progressBlocks,
        tasks,
        completedGoalKeys,
        sessionLoggedKeys,
        fullyCompletedGoalKeys,
        hasDraftBlocks,
        goalRecords,
      });
      return;
    }

    if (fingerprint !== lastFingerprint.current) {
      lastFingerprint.current = fingerprint;
      syncGoalMetadata({
        completedGoalKeys,
        sessionLoggedKeys,
        fullyCompletedGoalKeys,
        goalRecords,
      });
    }
  }, [
    applyWeekData,
    syncGoalMetadata,
    blocks,
    progressBlocks,
    tasks,
    completedGoalKeys,
    sessionLoggedKeys,
    fullyCompletedGoalKeys,
    hasDraftBlocks,
    goalRecords,
  ]);

  return <>{children}</>;
}
