"use client";

import { useEffect } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { DailyTaskBoard } from "@/components/dashboard/daily-task-board";
import { MilestonesSection } from "@/components/dashboard/milestones-section";
import { SchedulePanel } from "@/components/dashboard/schedule-panel";
import { DriftAlertBanner } from "@/components/drift/drift-alert-banner";
import { useLanguage } from "@/components/providers/language-provider";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import type { DriftState } from "@/app/actions/planner";
import { Card, CardContent } from "@/components/ui/card";
import { FractionCounter } from "@/components/ui/bidi-text";
import { Progress } from "@/components/ui/progress";
import { getGreeting } from "@/lib/i18n";
import { getCompletionLabel } from "@/lib/progress";
import type { TodaySlot } from "@/types/database";

interface MilestoneItem {
  id: string;
  title: string;
  courseName: string;
  dueInDays: number;
  progressPercent: number;
}

interface Props {
  milestones: MilestoneItem[];
  todaySchedules: TodaySlot[];
  driftState: DriftState;
}

export function Dashboard({ milestones, todaySchedules, driftState }: Props) {
  const { translate, locale } = useLanguage();
  const { todayTableRows, ensureLoaded } = usePlannerSchedule();

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const goals = todayTableRows;

  const finishedCount = goals.filter((g) => g.isFullyCompleted).length;
  const overallProgress =
    goals.length > 0
      ? Math.round((finishedCount / goals.length) * 100)
      : 0;

  return (
    <>
      <AppHeader
        titleKey="dashboard"
        subtitle={`${getGreeting(locale)} — ${translate("planForToday")}`}
      />

      <DriftAlertBanner drift={driftState} />

      <div className="space-y-8 p-4 sm:p-6 max-md:min-w-0 max-md:w-full max-md:overflow-x-hidden">
        <MilestonesSection milestones={milestones} />

        <Card className="border-border shadow-sm max-md:min-w-0">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2 text-sm max-md:min-w-0">
              <span className="min-w-0 truncate font-medium">{translate("overallProgress")}</span>
              <span className="flex flex-row items-center gap-1 font-mono font-semibold text-primary">
                <FractionCounter numerator={finishedCount} denominator={goals.length} />
                <span className="font-normal text-muted-foreground">
                  {translate("tasksFinished")}
                </span>
              </span>
            </div>
            <Progress value={overallProgress} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {getCompletionLabel(overallProgress, locale)}
            </p>
          </CardContent>
        </Card>

        <DailyTaskBoard goals={goals} />

        <SchedulePanel slots={todaySchedules} />
      </div>
    </>
  );
}
