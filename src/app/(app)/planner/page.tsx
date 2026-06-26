import { Suspense } from "react";
import { PlannerCalendar } from "@/components/planner/planner-calendar";
import { PlannerPageSkeleton } from "@/components/planner/planner-skeleton";
import { ScheduleHydrator } from "@/components/providers/schedule-hydrator";
import { getCourses } from "@/app/actions/courses";
import { loadPlannerWeekData } from "@/app/actions/planner";
import { getWeekBounds } from "@/lib/plan-horizon";
import { todayDateString } from "@/lib/drift-detection";

async function PlannerPageContent() {
  const { weekStart, weekEnd } = getWeekBounds(todayDateString());
  const [weekData, courses] = await Promise.all([
    loadPlannerWeekData(weekStart, weekEnd),
    getCourses(),
  ]);

  return (
    <ScheduleHydrator
      blocks={weekData.calendarBlocks}
      progressBlocks={weekData.progressBlocks}
      tasks={weekData.tasks}
      completedGoalKeys={weekData.completedGoalKeys}
      sessionLoggedKeys={weekData.sessionLoggedKeys}
      fullyCompletedGoalKeys={weekData.fullyCompletedGoalKeys}
      hasDraftBlocks={weekData.hasDraftBlocks}
      goalRecords={weekData.goalRecords}
    >
      <PlannerCalendar
        initialBlocks={weekData.calendarBlocks}
        initialHasDraftBlocks={weekData.hasDraftBlocks}
        lockedHistoryBlocks={weekData.lockedHistoryBlocks}
        completedGoalKeys={weekData.completedGoalKeys}
        initialWeekStart={weekStart}
        tasks={weekData.tasks}
        courses={courses}
      />
    </ScheduleHydrator>
  );
}

export default function PlannerPage() {
  return (
    <Suspense fallback={<PlannerPageSkeleton />}>
      <PlannerPageContent />
    </Suspense>
  );
}
