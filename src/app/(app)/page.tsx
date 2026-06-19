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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const milestones = tasks
    .filter(t => t.due_date)
    .map(t => {
      const due = new Date(t.due_date!);
      due.setHours(0, 0, 0, 0);
      const dueInDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { task: t, dueInDays };
    })
    .filter(({ dueInDays }) => dueInDays >= 0 && dueInDays <= 14)
    .sort((a, b) => a.dueInDays - b.dueInDays)
    .slice(0, 4)
    .map(({ task, dueInDays }) => ({
      id:              task.id,
      title:           task.title,
      courseName:      task.course_name ?? "",
      dueInDays,
      progressPercent: task.status === "completed" ? 100 : task.progress ?? 0,
    }));

  const scheduleTasks = weekData.tasks.length > 0 ? weekData.tasks : tasks;

  return (
    <ScheduleHydrator
      blocks={weekData.calendarBlocks}
      progressBlocks={weekData.progressBlocks}
      tasks={scheduleTasks as typeof tasks}
      completedGoalKeys={weekData.completedGoalKeys}
      hasDraftBlocks={weekData.hasDraftBlocks}
      goalRecords={weekData.goalRecords}
    >
      <Dashboard
        milestones={milestones}
        todaySchedules={todayAgenda}
        driftState={driftState}
      />
    </ScheduleHydrator>
  );
}
