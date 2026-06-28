"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarIcon,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ListChecks,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  addScheduleSlots,
  deleteScheduleSlot,
  deleteCourse,
} from "@/app/actions/courses";
import { deleteTask, updateTaskDueDate, updateTaskEstimatedDuration, updateTaskProgress, resetTaskPriorities } from "@/app/actions/tasks";
import { sortTasksByDisplayOrder } from "@/lib/task-sort";
import { AddCourseForm } from "@/components/forms/add-course-form";
import { AddTaskForm } from "@/components/forms/add-task-form";
import { TaskPriorityList } from "@/components/manage/task-priority-list";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TimeSelect } from "@/components/ui/time-select";
import { useLanguage } from "@/components/providers/language-provider";
import { useOnboardingOptional } from "@/components/providers/onboarding-provider";
import {
  AutoDirText,
  LtrIsolate,
  PercentValue,
} from "@/components/ui/bidi-text";
import { cn, formatMinutes, formatTime } from "@/lib/utils";
import type {
  CourseWithSchedules,
  Schedule,
  ScheduleType,
  Task,
} from "@/types/database";
import type { ScheduleSlotInput } from "@/app/actions/courses";

const TYPE_VARIANT = {
  lecture: "default" as const,
  tutorial: "secondary" as const,
  other: "muted" as const,
};

// ─── Inline Add-Slot Form ─────────────────────────────────────────────────────

function AddSlotInline({
  courseId,
  onAdded,
}: {
  courseId: string;
  onAdded: (slots: Schedule[]) => void;
}) {
  const router = useRouter();
  const { translate } = useLanguage();
  const [isPending, startTransition] = useTransition();
  const [slot, setSlot] = useState<ScheduleSlotInput>({
    type: "lecture",
    day_of_week: 2,
    start_time: "09:00",
    duration: 120,
  });

  const DAYS = [
    { value: 1, label: translate("sundayTxt") },
    { value: 2, label: translate("mondayTxt") },
    { value: 3, label: translate("tuesdayTxt") },
    { value: 4, label: translate("wednesdayTxt") },
    { value: 5, label: translate("thursdayTxt") },
    { value: 6, label: translate("fridayTxt") },
    { value: 7, label: translate("saturdayTxt") },
  ];
  const TYPES: { value: ScheduleType; label: string }[] = [
    { value: "lecture", label: translate("lectureTxt") },
    { value: "tutorial", label: translate("tutorialTxt") },
    { value: "other", label: translate("otherTxt") },
  ];

  const handleSave = () => {
    startTransition(async () => {
      const res = await addScheduleSlots(courseId, [slot]);
      if (!res.error) {
        router.refresh();  // ← pull in the newly saved slot with its real ID
        onAdded([]);
      }
    });
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide">
        {translate("addSlotBtn")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{translate("typeLabel")}</Label>
          <Select
            value={slot.type}
            onChange={(e) =>
              setSlot((s) => ({ ...s, type: e.target.value as ScheduleType }))
            }
            disabled={isPending}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{translate("dayLabel")}</Label>
          <Select
            value={slot.day_of_week}
            onChange={(e) =>
              setSlot((s) => ({ ...s, day_of_week: Number(e.target.value) }))
            }
            disabled={isPending}
          >
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{translate("startTimeLabel")}</Label>
          <TimeSelect
            value={slot.start_time}
            onChange={(v) => setSlot((s) => ({ ...s, start_time: v }))}
            disabled={isPending}
            minuteStep={15}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{translate("durationMinLabel")}</Label>
          <Input
            type="number"
            min="15"
            max="480"
            step="15"
            value={slot.duration}
            onChange={(e) =>
              setSlot((s) => ({ ...s, duration: Number(e.target.value) }))
            }
            disabled={isPending}
          />
        </div>
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={handleSave}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {isPending ? translate("savingLabel") : translate("addSlotBtn")}
      </Button>
    </div>
  );
}

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({
  course,
  onCourseDelete,
  onSlotDelete,
  onSlotAdd,
}: {
  course: CourseWithSchedules;
  onCourseDelete: (id: string) => void;
  onSlotDelete: (slotId: string, courseId: string) => void;
  onSlotAdd: (courseId: string) => void;
}) {
  const { translate } = useLanguage();
  const [expanded, setExpanded] = useState(true);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [deletingCourse, startDeleteCourse] = useTransition();
  const [deletingSlot, startDeleteSlot] = useTransition();

  const DAYS = [
    translate("sundayTxt"),
    translate("mondayTxt"),
    translate("tuesdayTxt"),
    translate("wednesdayTxt"),
    translate("thursdayTxt"),
    translate("fridayTxt"),
    translate("saturdayTxt"),
  ];

  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            <AutoDirText>{course.course_name}</AutoDirText>
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-primary hover:bg-primary/10"
              onClick={() => {
                setShowAddSlot((v) => !v);
                setExpanded(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {!showAddSlot && translate("addSlotToCourse")}
            </Button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                startDeleteCourse(async () => {
                  await deleteCourse(course.id);
                  onCourseDelete(course.id);
                });
              }}
              disabled={deletingCourse}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              title={translate("deleteCourse")}
            >
              {deletingCourse ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-2 pb-3">
          {showAddSlot && (
            <AddSlotInline
              courseId={course.id}
              onAdded={() => {
                setShowAddSlot(false);
                onSlotAdd(course.id);
              }}
            />
          )}

          {(course.schedules as Schedule[]).length > 0 ? (
            (course.schedules as Schedule[]).map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                <Badge variant={TYPE_VARIANT[s.type]} className="text-[10px] shrink-0">
                  {translate(
                    s.type === "lecture" ? "lectureTxt"
                    : s.type === "tutorial" ? "tutorialTxt"
                    : "otherTxt"
                  )}
                </Badge>
                <span className="font-medium">{DAYS[s.day_of_week - 1]}</span>
                <span className="text-muted-foreground">
                  <LtrIsolate>{formatTime(s.start_time)}</LtrIsolate>
                </span>
                <span className="ms-auto flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <LtrIsolate>{formatMinutes(s.duration)}</LtrIsolate>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    startDeleteSlot(async () => {
                      await deleteScheduleSlot(s.id);
                      onSlotDelete(s.id, course.id);
                    });
                  }}
                  disabled={deletingSlot}
                  className="p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive disabled:opacity-30"
                  title={translate("deleteSlot")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-1 text-xs text-muted-foreground">
              {translate("noScheduleSlotsYet")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Progress bar colour ─────────────────────────────────────────────────────
function progressBarColour(p: number) {
  if (p >= 100) return "bg-emerald-500";
  if (p >= 75)  return "bg-blue-500";
  if (p >= 50)  return "bg-amber-500";
  if (p >= 25)  return "bg-orange-500";
  return "bg-muted-foreground/30";
}

// ─── Inline progress widget ───────────────────────────────────────────────────
function ProgressWidget({
  taskId,
  initial,
  onSaved,
}: {
  taskId: string;
  initial: number;
  onSaved: (next: number) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [saving, startSave] = useTransition();

  const save = () => {
    const clamped = Math.min(100, Math.max(0, draft));
    startSave(async () => {
      await updateTaskProgress(taskId, clamped);
      router.refresh();
      onSaved(clamped);
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={5}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          disabled={saving}
          className="h-7 w-14 rounded border border-input bg-background px-1.5 text-center text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded border border-primary bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Numeric label */}
      <span className="w-8 text-end text-xs font-semibold tabular-nums text-muted-foreground">
        <PercentValue value={initial} />
      </span>
      {/* Minimal bar — desktop only */}
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted md:block">
        <div
          className={cn("h-full rounded-full transition-all", progressBarColour(initial))}
          style={{ width: `${initial}%` }}
        />
      </div>
      {/* Edit pencil — desktop only */}
      <button
        type="button"
        onClick={() => { setDraft(initial); setEditing(true); }}
        className="hidden p-0.5 text-muted-foreground/40 hover:text-primary transition-colors md:inline-flex"
        title="Override progress"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Inline ETA (estimated duration) widget ─────────────────────────────────
function DurationWidget({
  taskId,
  initial,
  onSaved,
}: {
  taskId: string;
  initial: number | null;
  onSaved: (next: number | null) => void;
}) {
  const router = useRouter();
  const { patchTask } = usePlannerSchedule();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial != null ? String(initial) : "");
  const [saving, startSave] = useTransition();

  const save = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Math.round(Number(trimmed));
    if (trimmed !== "" && (!Number.isFinite(next) || next! <= 0)) return;

    patchTask(taskId, { estimated_duration: next });
    onSaved(next);

    startSave(async () => {
      const result = await updateTaskEstimatedDuration(taskId, next);
      if (result.error) return;
      router.refresh();
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <input
          type="number"
          min={1}
          step={15}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          placeholder="min"
          className="h-7 w-16 rounded border border-input bg-background px-1.5 text-center text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded border border-primary bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {initial != null ? (
          <LtrIsolate>{formatMinutes(initial)}</LtrIsolate>
        ) : (
          <span>—</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => {
          setDraft(initial != null ? String(initial) : "");
          setEditing(true);
        }}
        className="hidden p-0.5 text-muted-foreground/40 hover:text-primary transition-colors md:inline-flex"
        title="Edit estimated time"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Inline deadline widget ───────────────────────────────────────────────────
function DeadlineWidget({
  taskId,
  initial,
  locale,
  onSaved,
  variant = "inline",
}: {
  taskId: string;
  initial: string | null;
  locale: "en" | "he";
  onSaved: (next: string | null) => void;
  /** `embedded` — date editor for mobile overflow menu (no trigger button) */
  variant?: "inline" | "embedded";
}) {
  const router = useRouter();
  const { translate } = useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial ?? "");
  const [saving, startSave] = useTransition();

  const formatDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(
      locale === "he" ? "he-IL" : "en-GB",
      { day: "2-digit", month: "short", year: "numeric" },
    );

  const save = () => {
    const next = draft.trim() || null;
    startSave(async () => {
      const result = await updateTaskDueDate(taskId, next);
      if (result.error) return;
      router.refresh();
      onSaved(next);
      setOpen(false);
    });
  };

  const clear = () => {
    startSave(async () => {
      const result = await updateTaskDueDate(taskId, null);
      if (result.error) return;
      setDraft("");
      router.refresh();
      onSaved(null);
      setOpen(false);
    });
  };

  const editorPanel = (
    <div
      className={cn(
        variant === "embedded"
          ? "space-y-2"
          : "absolute end-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-card p-2.5 shadow-lg",
      )}
      dir="ltr"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {translate("dueDateLabel")}
      </p>
      {initial && variant === "embedded" && (
        <p className="text-xs text-foreground">
          <LtrIsolate>{formatDate(initial)}</LtrIsolate>
        </p>
      )}
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        className="h-8 w-full rounded border border-input bg-background px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") variant === "embedded" ? undefined : setOpen(false);
        }}
        autoFocus={variant !== "embedded"}
      />
      <div className="mt-2 flex items-center gap-1">
        <Button
          size="sm"
          className="h-7 flex-1 gap-1 text-xs"
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {translate("saveLabel")}
        </Button>
        {initial && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={clear}
            disabled={saving}
            title={translate("clearDeadline")}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );

  if (variant === "embedded") {
    return editorPanel;
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setDraft(initial ?? "");
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        title={initial ? translate("editDeadline") : translate("setDeadline")}
        aria-expanded={open}
      >
        <CalendarIcon className="h-3 w-3 shrink-0 opacity-70" />
        {initial ? (
          <LtrIsolate>{formatDate(initial)}</LtrIsolate>
        ) : (
          <span>{translate("noDeadline")}</span>
        )}
        <Pencil className="h-2.5 w-2.5 shrink-0 opacity-40" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          {editorPanel}
        </>
      )}
    </div>
  );
}

// ─── Mobile task row overflow menu ───────────────────────────────────────────

function TaskRowMobileMenu({
  task,
  locale,
  deleting,
  onDelete,
  onDueDateChange,
  deleteActionKey = "deleteTask",
}: {
  task: Task;
  locale: "en" | "he";
  deleting: boolean;
  onDelete: () => void;
  onDueDateChange?: (id: string, dueDate: string | null) => void;
  deleteActionKey?: "deleteTask" | "removeFromList";
}) {
  const { translate } = useLanguage();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <div className="relative shrink-0 md:hidden">
      <button
        type="button"
        aria-label="More options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={close}
          />
          <div
            className="absolute end-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <DeadlineWidget
              variant="embedded"
              taskId={task.id}
              initial={task.due_date}
              locale={locale}
              onSaved={(next) => {
                onDueDateChange?.(task.id, next);
                close();
              }}
            />

            <div className="mt-3 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full gap-2 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                disabled={deleting}
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {translate(deleteActionKey)}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Task Row ────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onDelete,
  onProgressChange,
  onDueDateChange,
  onEstimatedDurationChange,
  deleteActionKey = "deleteTask",
}: {
  task: Task;
  onDelete: (id: string) => void;
  onProgressChange?: (id: string, progress: number) => void;
  onDueDateChange?: (id: string, dueDate: string | null) => void;
  onEstimatedDurationChange?: (id: string, minutes: number | null) => void;
  deleteActionKey?: "deleteTask" | "removeFromList";
}) {
  const router = useRouter();
  const { translate, locale } = useLanguage();
  const [deleting, startDelete] = useTransition();

  const progress = task.progress ?? 0;
  const isDone = progress >= 100;

  const handleDelete = () => {
    startDelete(async () => {
      await deleteTask(task.id);
      router.refresh();
      onDelete(task.id);
    });
  };

  return (
    <Card className={cn("transition-shadow hover:shadow-sm", isDone && "bg-muted/20")}>
      <CardContent className="flex items-start gap-2 p-3 md:items-center md:gap-3">
        {/* Title + course */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className={cn(
            "font-sans text-sm font-medium not-italic",
            "whitespace-normal break-words md:truncate",
            isDone ? "text-muted-foreground line-through opacity-60" : "text-foreground"
          )}>
            <AutoDirText>{task.title}</AutoDirText>
          </p>
          {task.course_name && (
            <p className="truncate font-sans text-xs text-muted-foreground not-italic max-md:whitespace-normal max-md:break-words md:truncate">
              <AutoDirText>{task.course_name}</AutoDirText>
            </p>
          )}
        </div>

        {/* ETA + progress — mobile: ETA then %; desktop: progress then ETA (unchanged) */}
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <div className="order-3 md:order-2">
            <ProgressWidget
              taskId={task.id}
              initial={progress}
              onSaved={(next) => onProgressChange?.(task.id, next)}
            />
          </div>
          <div className="order-2 md:order-3">
            <DurationWidget
              taskId={task.id}
              initial={task.estimated_duration}
              onSaved={(next) => onEstimatedDurationChange?.(task.id, next)}
            />
          </div>
        </div>

        {/* Due date + delete — desktop only */}
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <DeadlineWidget
            taskId={task.id}
            initial={task.due_date}
            locale={locale}
            onSaved={(next) => onDueDateChange?.(task.id, next)}
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
            title={translate(deleteActionKey)}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Overflow menu — mobile only */}
        <TaskRowMobileMenu
          task={task}
          locale={locale}
          deleting={deleting}
          onDelete={handleDelete}
          onDueDateChange={onDueDateChange}
          deleteActionKey={deleteActionKey}
        />
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  initialCourses: CourseWithSchedules[];
  initialTasks: Task[];
  courseOptions: { id: string; course_name: string }[];
}

// ─── ManageClient ─────────────────────────────────────────────────────────────
export function ManageClient({
  initialCourses,
  initialTasks,
  courseOptions: initialCourseOptions,
}: Props) {
  const { translate } = useLanguage();
  const onboarding = useOnboardingOptional();
  const { patchTask, ensureLoaded } = usePlannerSchedule();
  const [courses, setCourses] = useState<CourseWithSchedules[]>(initialCourses);
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [courseOptions, setCourseOptions] = useState(initialCourseOptions);
  const [activeTab, setActiveTab] = useState<"course" | "task">("task");
  const [priorityEditMode, setPriorityEditMode] = useState(false);
  const [resettingPriority, startResetPriority] = useTransition();

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    setCourses(initialCourses);
  }, [initialCourses]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setCourseOptions(initialCourseOptions);
  }, [initialCourseOptions]);

  useEffect(() => {
    if (!onboarding?.tourActive) return;
    if (onboarding.tourStepIndex === 3) {
      setActiveTab("course");
    }
    if (onboarding.tourStepIndex === 4) {
      setActiveTab("task");
    }
  }, [onboarding?.tourActive, onboarding?.tourStepIndex]);

  const handleCourseDelete = (id: string) =>
    setCourses((prev) => prev.filter((c) => c.id !== id));

  const handleSlotDelete = (slotId: string, courseId: string) =>
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? {
              ...c,
              schedules: (c.schedules as Schedule[]).filter(
                (s) => s.id !== slotId
              ),
            }
          : c
      )
    );

  const handleTaskDelete = (id: string) =>
    setTasks((prev) => prev.filter((t) => t.id !== id));

  const handleTaskProgress = (id: string, progress: number) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));

  const handleTaskDueDate = (id: string, due_date: string | null) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_date } : t)));

  const handleTaskEstimatedDuration = (id: string, estimated_duration: number | null) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, estimated_duration } : t)));

  const handleTaskReorder = (next: Task[]) => {
    setTasks((prev) => {
      const byId = new Map(next.map((t) => [t.id, t]));
      const rest = prev.filter((t) => !byId.has(t.id));
      return [...next, ...rest];
    });
    next.forEach((t, i) => patchTask(t.id, { user_priority_index: i }));
  };

  const handleResetPriority = () => {
    startResetPriority(async () => {
      await resetTaskPriorities();
      setTasks((prev) => {
        prev.forEach((t) => patchTask(t.id, { user_priority_index: null }));
        return prev.map((t) => ({ ...t, user_priority_index: null }));
      });
      router.refresh();
    });
  };

  const activeTasks    = sortTasksByDisplayOrder(
    tasks.filter((t) => (t.progress ?? 0) < 100 && !t.deleted_at),
  );
  const completedTasks = tasks.filter(
    (t) => (t.progress ?? 0) >= 100 && !t.backlog_hidden_at,
  );

  return (
    <div className="space-y-8 p-4 sm:p-6">
      {/* ── 1. My Courses ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("manageCourses")}</h2>
          <span className="text-sm text-muted-foreground">
            ({courses.length})
          </span>
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
                onCourseDelete={handleCourseDelete}
                onSlotDelete={handleSlotDelete}
                onSlotAdd={() => {/* router.refresh() already called in AddSlotInline */}}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Tasks (Active + Completed) ────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{translate("activeTasks")}</h2>
            <span className="text-sm text-muted-foreground">
              ({activeTasks.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {priorityEditMode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resettingPriority}
                onClick={handleResetPriority}
              >
                {resettingPriority ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Reset Order
              </Button>
            )}
            <Button
              type="button"
              variant={priorityEditMode ? "default" : "outline"}
              size="sm"
              onClick={() => setPriorityEditMode((v) => !v)}
            >
              {priorityEditMode ? "Done" : "Edit Priority"}
            </Button>
          </div>
        </div>

        {priorityEditMode ? (
          <TaskPriorityList tasks={activeTasks} onReorder={handleTaskReorder} />
        ) : activeTasks.length === 0 ? (
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
            {activeTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onDelete={handleTaskDelete}
                onProgressChange={handleTaskProgress}
                onDueDateChange={handleTaskDueDate}
                onEstimatedDurationChange={handleTaskEstimatedDuration}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── 2b. Completed Tasks ──────────────────────────────────────── */}
      {completedTasks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-muted-foreground">Completed</h2>
            <span className="text-sm text-muted-foreground">({completedTasks.length})</span>
          </div>
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                deleteActionKey="removeFromList"
                onDelete={handleTaskDelete}
                onProgressChange={handleTaskProgress}
                onDueDateChange={handleTaskDueDate}
                onEstimatedDurationChange={handleTaskEstimatedDuration}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── 3. Unified Add Block ────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("addNew")}</h2>
        </div>

        {/* Pill tab switcher */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("course")}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "course"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <BookOpen className="h-4 w-4" />
              {translate("newCourse")}
            </span>
          </button>
          <button
            type="button"
            data-tour="add-task-section"
            onClick={() => setActiveTab("task")}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "task"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <ListChecks className="h-4 w-4" />
              {translate("newTask")}
            </span>
          </button>
        </div>

        {activeTab === "course" ? (
          <AddCourseForm
            onSuccess={(course) => {
              setCourses((prev) => [course, ...prev]);
              setCourseOptions((prev) => {
                if (prev.some((c) => c.id === course.id)) return prev;
                return [
                  { id: course.id, course_name: course.course_name },
                  ...prev,
                ];
              });
            }}
          />
        ) : (
          <AddTaskForm
            courseOptions={courseOptions}
            onSuccess={(task) => {
              setTasks((prev) => [task, ...prev]);
            }}
          />
        )}
      </section>
    </div>
  );
}
