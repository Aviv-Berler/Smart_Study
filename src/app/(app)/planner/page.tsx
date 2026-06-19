import { PlannerCalendar } from "@/components/planner/planner-calendar";
import { ScheduleHydrator } from "@/components/providers/schedule-hydrator";
import { loadPlannerWeekData } from "@/app/actions/planner";
import { getWeekBounds } from "@/lib/plan-horizon";
import { todayDateString } from "@/lib/drift-detection";

export default async function PlannerPage() {
  const { weekStart, weekEnd } = getWeekBounds(todayDateString());
  const weekData = await loadPlannerWeekData(weekStart, weekEnd);

  return (
    <ScheduleHydrator
      blocks={weekData.calendarBlocks}
      progressBlocks={weekData.progressBlocks}
      tasks={weekData.tasks}
      completedGoalKeys={weekData.completedGoalKeys}
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
      />
    </ScheduleHydrator>
  );
}
