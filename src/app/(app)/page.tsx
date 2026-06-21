import { getTasks } from "@/app/actions/tasks";
import { getSchedulesForToday } from "@/app/actions/courses";
import { loadPlannerWeekData, getTodayStudyBlocks, getDriftState } from "@/app/actions/planner";
import { Dashboard } from "@/components/dashboard/dashboard";
import { ScheduleHydrator } from "@/components/providers/schedule-hydrator";
import { getWeekBounds } from "@/lib/plan-horizon";
import { todayDateString } from "@/lib/drift-detection";

export default async function HomePage() {
  const todayStr = todayDateString();
  const { weekStart, weekEnd } = getWeekBounds(todayStr);

  const [tasks, weekData, todaySchedules, todayStudyBlocks, driftState] = await Promise.all([
    getTasks(),
    loadPlannerWeekData(weekStart, weekEnd),
    getSchedulesForToday(),
    getTodayStudyBlocks(),
    getDriftState(),
  ]);

  const todayAgenda = [
    ...todaySchedules.map(s => ({ ...s, kind: "course" as const })),
    ...todayStudyBlocks,
  ].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const scheduleTasks = weekData.tasks.length > 0 ? weekData.tasks : tasks;

  return (
    <ScheduleHydrator
      blocks={weekData.calendarBlocks}
      progressBlocks={weekData.progressBlocks}
      tasks={scheduleTasks as typeof tasks}
      completedGoalKeys={weekData.completedGoalKeys}
      sessionLoggedKeys={weekData.sessionLoggedKeys}
      fullyCompletedGoalKeys={weekData.fullyCompletedGoalKeys}
      hasDraftBlocks={weekData.hasDraftBlocks}
      goalRecords={weekData.goalRecords}
    >
      <Dashboard
        todaySchedules={todayAgenda}
        driftState={driftState}
      />
    </ScheduleHydrator>
  );
}
