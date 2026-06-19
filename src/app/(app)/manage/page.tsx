import { AppHeader } from "@/components/layout/app-header";
import { ManageClient } from "@/components/manage/manage-client";
import { getCoursesWithSchedules, getCourses } from "@/app/actions/courses";
import { getAllTasks } from "@/app/actions/tasks";
import type { CourseWithSchedules, Task } from "@/types/database";

export default async function ManagePage() {
  const [courses, tasks, courseOptions] = await Promise.all([
    getCoursesWithSchedules(),
    getAllTasks(),
    getCourses(),
  ]);

  return (
    <>
      <AppHeader titleKey="manageTitle" subtitleKey="manageDesc" />
      <ManageClient
        initialCourses={courses as CourseWithSchedules[]}
        initialTasks={tasks as Task[]}
        courseOptions={courseOptions}
      />
    </>
  );
}
