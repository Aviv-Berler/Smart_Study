import { Suspense } from "react";
import { getTasks } from "@/app/actions/tasks";
import { loadPlannerWeekData, getDriftState } from "@/app/actions/planner";
import { Dashboard } from "@/components/dashboard/dashboard";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { ScheduleHydrator } from "@/components/providers/schedule-hydrator";
import { getWeekBounds } from "@/lib/plan-horizon";
import { todayDateString } from "@/lib/drift-detection";
import { buildTodayAgendaFromCalendarBlocks } from "@/lib/schedule-merge";

async function DashboardPageContent() {
  const todayStr = todayDateString();
  const { weekStart, weekEnd } = getWeekBounds(todayStr);

  const [tasks, weekData, driftState] = await Promise.all([
    getTasks(),
    loadPlannerWeekData(weekStart, weekEnd),
    getDriftState(),
  ]);

  const todayAgenda = buildTodayAgendaFromCalendarBlocks(
    weekData.calendarBlocks,
    todayStr,
  );

  // #region agent log
  const mergedTodayClasses = weekData.calendarBlocks.filter(
    (b) => b.scheduled_date === todayStr && (b.kind === "fixed" || b.kind === "class_override"),
  );
  fetch("http://127.0.0.1:7896/ingest/77050572-b00b-46d6-b0e9-fc65b92d4866", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a83934" },
    body: JSON.stringify({
      sessionId: "a83934",
      runId: "post-fix",
      hypothesisId: "H1-H3",
      location: "page.tsx:DashboardPageContent",
      message: "daily agenda source comparison",
      data: {
        todayStr,
        mergedClassCount: mergedTodayClasses.length,
        mergedClassIds: mergedTodayClasses.map((b) => b.id),
        agendaCount: todayAgenda.length,
        agendaIds: todayAgenda.map((s) => s.id),
        agendaCourseSlots: todayAgenda
          .filter((s) => s.kind === "course")
          .map((s) => ({ id: s.id, name: s.courseName, start: s.startTime })),
        includesAllMergedClasses: mergedTodayClasses.every((b) =>
          todayAgenda.some((s) => s.id === b.id),
        ),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}
