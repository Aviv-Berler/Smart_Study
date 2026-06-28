"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Clock,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  addScheduleSlots,
  deleteCourse,
  deleteScheduleSlot,
  saveCourseWithSchedules,
} from "@/app/actions/courses";
import { addTask, deleteTask } from "@/app/actions/tasks";
import { AddCourseForm } from "@/components/forms/add-course-form";
import { AddTaskForm } from "@/components/forms/add-task-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/providers/language-provider";
import { AutoDirText, LtrIsolate } from "@/components/ui/bidi-text";
import { cn, formatMinutes, formatTime } from "@/lib/utils";
import type { CourseWithSchedules, Schedule, Task } from "@/types/database";

const TYPE_VARIANT = {
  lecture: "default" as const,
  tutorial: "secondary" as const,
  other: "muted" as const,
};

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({
  course,
  onDelete,
  onSlotDelete,
}: {
  course: CourseWithSchedules;
  onDelete: (id: string) => void;
  onSlotDelete: (slotId: string, courseId: string) => void;
}) {
  const { translate } = useLanguage();
  const [deleting, startDelete] = useTransition();
  const [deletingSlot, startSlotDelete] = useTransition();
  const [expanded, setExpanded] = useState(true);

  const handleDeleteCourse = () => {
    startDelete(async () => {
      await deleteCourse(course.id);
      onDelete(course.id);
    });
  };

  const handleDeleteSlot = (slotId: string) => {
    startSlotDelete(async () => {
      await deleteScheduleSlot(slotId);
      onSlotDelete(slotId, course.id);
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            <AutoDirText>{course.course_name}</AutoDirText>
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleDeleteCourse}
              disabled={deleting}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              aria-label={translate("deleteCourse")}
              title={translate("deleteCourse")}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-1.5 pb-3">
          {course.schedules?.length > 0 ? (
            (course.schedules as Schedule[]).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs group"
              >
                <Badge variant={TYPE_VARIANT[s.type]} className="text-[10px] shrink-0">
                  {s.type}
                </Badge>
                <span className="font-medium">
                  {[
                    translate("sundayTxt"),
                    translate("mondayTxt"),
                    translate("tuesdayTxt"),
                    translate("wednesdayTxt"),
                    translate("thursdayTxt"),
                    translate("fridayTxt"),
                    translate("saturdayTxt"),
                  ][s.day_of_week - 1]}
                </span>
                <LtrIsolate className="text-muted-foreground">
                  {formatTime(s.start_time)}
                </LtrIsolate>
                <span className="ms-auto flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <LtrIsolate>{formatMinutes(s.duration)}</LtrIsolate>
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteSlot(s.id)}
                  disabled={deletingSlot}
                  className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                  aria-label={translate("deleteSlot")}
                  title={translate("deleteSlot")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground px-1">
              {translate("noScheduleSlotsYet")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Task Row ────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onDelete,
}: {
  task: Task;
  onDelete: (id: string) => void;
}) {
  const { translate } = useLanguage();
  const [deleting, startDelete] = useTransition();

  const handleDelete = () => {
    startDelete(async () => {
      await deleteTask(task.id);
      onDelete(task.id);
    });
  };

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-medium">
            <AutoDirText>{task.title}</AutoDirText>
          </p>
          {task.course_name && (
            <p className="text-xs text-muted-foreground">
              <AutoDirText>{task.course_name}</AutoDirText>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {task.estimated_duration && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatMinutes(task.estimated_duration)}
            </span>
          )}
          {task.due_date && (
            <span className="text-xs text-muted-foreground">
              {new Date(task.due_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            aria-label={translate("deleteTask")}
            title={translate("deleteTask")}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Client Component ───────────────────────────────────────────────────

interface Props {
  initialCourses: CourseWithSchedules[];
  initialTasks: Task[];
}

export function PlannerClient({ initialCourses, initialTasks }: Props) {
  const { translate } = useLanguage();
  const [courses, setCourses] = useState<CourseWithSchedules[]>(initialCourses);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeTab, setActiveTab] = useState<"task" | "course">("course");

  const visibleTasks = tasks.filter((t) => !t.deleted_at);

  const handleCourseDelete = (id: string) =>
    setCourses((prev) => prev.filter((c) => c.id !== id));

  const handleSlotDelete = (slotId: string, courseId: string) =>
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              schedules: c.schedules.filter((s) => (s as Schedule).id !== slotId),
            }
          : c
      )
    );

  const handleTaskDelete = (id: string) =>
    setTasks((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="space-y-8 p-4 sm:p-6">
      {/* ── 1. My Courses ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("myCourses")}</h2>
          <LtrIsolate className="text-sm text-muted-foreground">({courses.length})</LtrIsolate>
        </div>

        {courses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {translate("noCoursesYet")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onDelete={handleCourseDelete}
                onSlotDelete={handleSlotDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Active Tasks ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("myActiveTasks")}</h2>
          <LtrIsolate className="text-sm text-muted-foreground">({visibleTasks.length})</LtrIsolate>
        </div>

        {visibleTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <ListChecks className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {translate("noTasksYet")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onDelete={handleTaskDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 3. Unified Add Block ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("addNew")}</h2>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("course")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "course"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {translate("newCourse")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("task")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "task"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {translate("newTask")}
          </button>
        </div>

        {activeTab === "course" ? (
          <AddCourseForm
            onSuccess={() => {
              // Page revalidation handled by server action; optimistic update not needed here
            }}
          />
        ) : (
          <AddTaskForm />
        )}
      </section>
    </div>
  );
}
