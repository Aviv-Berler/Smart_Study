"use client";

import { useState, useEffect, useTransition, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  addDays, format, subDays, isSameDay,
} from "date-fns";
import {
  CalendarDays, Sparkles,
  Loader2, CheckCircle2, AlertTriangle, Zap, RotateCcw, Trash2, Pencil, Plus,
  ChevronLeft, ChevronRight, GripVertical, Menu, GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateSelect } from "@/components/ui/date-select";
import { TimeSelect } from "@/components/ui/time-select";
import {
  generateSchedulePlan,
  acceptConflictOption,
  approvePlan,
  updateBlockTime,
  deleteBlock,
  discardDraftPlan,
  undoApproval,
  clearPlannerRange,
  createManualBlock,
  loadPlannerWeekData,
  cancelVirtualClassInstance,
  moveVirtualClassInstance,
  revertClassOverride,
} from "@/app/actions/planner";
import { useLanguage } from "@/components/providers/language-provider";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useOnboardingOptional } from "@/components/providers/onboarding-provider";
import { usePlannerSchedule } from "@/components/providers/planner-schedule-provider";
import { useUser } from "@/components/providers/user-provider";
import {
  buildTimelineBlocks,
  computeLiveDailyGoals,
  normalizeCalendarBlock,
  type LiveDailyGoalEntry,
} from "@/lib/planner-goals";
import {
  filterBlocksAfterPlannerReset,
  getPlannerClock,
  PLANNER_DEFAULT_TIMEZONE,
  protectedTaskIdsFromGoalRecords,
  resolvePlannerTimezone,
} from "@/lib/planner-reset";
import {
  AutoDirText,
  LtrIsolate,
  PercentValue,
  TimeRange,
} from "@/components/ui/bidi-text";
import { isolateLtr } from "@/lib/bidi";
import { cn } from "@/lib/utils";
import { getPlanHorizon, getWeekBounds, parseLocalDate, toDateKey, normalizeTimeKey } from "@/lib/plan-horizon";
import {
  isVirtualClassBlockId,
  parseVirtualClassBlockId,
} from "@/lib/schedule-merge";
import {
  getBlockInteractivity,
  isMissedBlock,
} from "@/lib/drift-detection";
import type {
  CalendarBlock,
  LockedHistoryBlock,
  PlannerConflictState,
  PlannerConflictOption,
  Task,
} from "@/types/database";

// ── Grid constants ─────────────────────────────────────────────────────────────
const HOURS        = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const HOUR_HEIGHT  = 48;
const BLOCK_MIN_HEIGHT = 24;
const GRID_START   = HOURS[0] * 60;
const GRID_END     = (HOURS[HOURS.length - 1] + 1) * 60;
const TOTAL_HEIGHT = HOURS.length * HOUR_HEIGHT;
const SNAP_MIN     = 15; // snap to 15-minute increments
const MIN_DURATION = 15; // minimum block duration in minutes

/** Planner conflict/warning toasts — persist until the user dismisses manually. */
const PLANNER_ALERT_TOAST = {
  duration: Infinity,
  closeButton: true,
} as const;


function hhmm(s: string): number {
  const normalized = normalizeTimeKey(s);
  const [h, m] = normalized.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function countDraftAiBlocks(blocks: CalendarBlock[]): number {
  return blocks.filter((b) => b.kind === "ai" && !b.is_locked).length;
}

/** True when the block id is a persisted scheduled_blocks UUID (not a synthetic fixed-slot id). */
function isPersistedBlockId(id: string): boolean {
  if (id.startsWith("fixed-")) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function calendarBlocksEqual(a: CalendarBlock[], b: CalendarBlock[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Block colour logic ─────────────────────────────────────────────────────────
function isVirtualClassBlock(b: CalendarBlock): boolean {
  return b.is_virtual === true || (b.kind === "fixed" && isVirtualClassBlockId(b.id));
}

function blockClass(b: CalendarBlock, missed = false): string {
  if (missed) {
    return "bg-red-500/15 text-red-900 dark:text-red-200 ring-2 ring-red-500/55";
  }
  if (b.kind === "fixed")
    return "bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500/45";
  if (b.kind === "class_override")
    return "bg-indigo-600/25 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-600/50";
  if (b.kind === "one_off")
    return "bg-violet-500/20 text-violet-800 dark:text-violet-300 ring-1 ring-violet-500/40";
  if (b.is_locked)
    return "bg-emerald-400/25 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/40";
  return "bg-primary/20 text-primary ring-1 ring-primary/30";
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({
  weekDays,
  onPrevWeek,
  onNextWeek,
  onToday,
  onReset,
  resetting,
  onAddBlock,
  loadingWeek,
}: {
  weekDays:     Date[];
  onPrevWeek:   () => void;
  onNextWeek:   () => void;
  onToday:      () => void;
  onReset?:     () => void;
  resetting?:   boolean;
  onAddBlock?:  () => void;
  loadingWeek?: boolean;
}) {
  const { translate, locale } = useLanguage();
  const weekStart = weekDays[0];
  const weekEnd   = weekDays[weekDays.length - 1];
  const title = weekStart.getMonth() === weekEnd.getMonth()
    ? `${format(weekStart, "MMMM d")} – ${format(weekEnd, "d, yyyy")}`
    : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const PrevIcon = locale === "he" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "he" ? ChevronLeft  : ChevronRight;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevWeek}
          disabled={loadingWeek}
          className="gap-1.5"
        >
          <PrevIcon className="h-4 w-4 shrink-0" />
          {translate("prevWeek")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToday}
          disabled={loadingWeek}
        >
          {translate("calendarToday")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNextWeek}
          disabled={loadingWeek}
          className="gap-1.5"
        >
          {translate("nextWeek")}
          <NextIcon className="h-4 w-4 shrink-0" />
        </Button>
      </div>

      <span className="flex-1 text-sm font-semibold">{title}</span>

      {loadingWeek && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {translate("loadingWeek")}
        </span>
      )}

      {onReset && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={resetting}
          title="Reset schedule — clears future AI blocks from now forward"
          className="gap-1.5 text-muted-foreground hover:border-destructive/60 hover:text-destructive hover:bg-destructive/5"
        >
          {resetting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2   className="h-3.5 w-3.5" />}
          Reset
        </Button>
      )}

      {onAddBlock && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddBlock}
          title="Add a manual locked block"
          className="gap-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Block
        </Button>
      )}
    </div>
  );
}

function DayHeader({ date, isToday, isPast }: { date: Date; isToday: boolean; isPast?: boolean }) {
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <span className={["text-[11px] font-semibold uppercase tracking-wide",
        isToday ? "text-primary" : isPast ? "text-muted-foreground/70" : "text-muted-foreground"].join(" ")}>
        {format(date, "EEE")}
      </span>
      <span className={["mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold",
        isToday ? "bg-primary text-primary-foreground" : isPast ? "text-muted-foreground/80" : "text-foreground"].join(" ")}>
        {format(date, "d")}
      </span>
    </div>
  );
}

// ─── BlockFormModal ────────────────────────────────────────────────────────────
/**
 * Dual-mode modal:
 *  "edit"   — adjust start/end time of an existing draft block
 *  "create" — add a fully new locked block with task, date, and time
 */
type BlockFormMode =
  | { type: "edit";   block: CalendarBlock }
  | { type: "create"; defaultDate: string };

function BlockFormModal({
  mode,
  tasks,
  courses = [],
  onSaveEdit,
  onSaveCreate,
  onClose,
}: {
  mode:          BlockFormMode;
  tasks:         Task[];
  courses?:      { id: string; course_name: string }[];
  onSaveEdit?:   (blockId: string, start: string, end: string, date: string) => Promise<void>;
  onSaveCreate?: (data: {
    block_kind:     "manual" | "one_off";
    task_id:        string | null;
    title:          string;
    scheduled_date: string;
    start_time:     string;
    end_time:       string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = mode.type === "edit";

  const [blockType, setBlockType] = useState<"task" | "completion">(
    isEdit
      ? (mode.block.kind === "one_off" ? "completion" : "task")
      : "task",
  );
  const [taskId, setTaskId] = useState<string>(
    isEdit ? (mode.block.task_id ?? "") : ""
  );
  const [courseId, setCourseId] = useState<string>("");
  const [title,  setTitle]  = useState(
    isEdit ? mode.block.title : ""
  );
  const [date,   setDate]   = useState(
    isEdit ? mode.block.scheduled_date : mode.defaultDate
  );
  const [start,  setStart]  = useState(
    isEdit ? mode.block.start_time.slice(0, 5) : "09:00"
  );
  const [end,    setEnd]    = useState(
    isEdit ? mode.block.end_time.slice(0, 5) : "10:30"
  );
  const [saving, setSaving] = useState(false);

  // When a task is selected in create mode, auto-fill the title
  const handleTaskChange = (id: string) => {
    setTaskId(id);
    if (!isEdit && id) {
      const t = tasks.find(t => t.id === id);
      if (t) setTitle(t.title);
    }
  };

  const handleSave = async () => {
    const isCompletion = blockType === "completion";
    const resolvedTitle = isCompletion
      ? (courses.find((c) => c.id === courseId)?.course_name ?? title).trim()
      : title.trim();

    if (!resolvedTitle) {
      toast.error(isCompletion ? "Please select a course." : "Block title is required.");
      return;
    }
    if (!isEdit && isCompletion && !courseId && !title.trim()) {
      toast.error("Please select a course.");
      return;
    }
    const durMin = hhmm(end) - hhmm(start);
    if (durMin < MIN_DURATION) {
      toast.error(`Block must be at least ${MIN_DURATION} minutes.`);
      return;
    }
    setSaving(true);
    if (isEdit && onSaveEdit) {
      await onSaveEdit(mode.block.id, start, end, date);
    } else if (!isEdit && onSaveCreate) {
      await onSaveCreate({
        block_kind:     isCompletion ? "one_off" : "manual",
        task_id:        isCompletion ? null : (taskId || null),
        title:          resolvedTitle,
        scheduled_date: date,
        start_time:     start,
        end_time:       end,
      });
    }
    setSaving(false);
    onClose();
  };

  // Escape closes the modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const inputCls = "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const labelCls = "mb-1 block text-[11px] font-medium text-muted-foreground";

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-[2px]"
      onPointerDown={onClose}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div
          className="my-auto w-full max-w-[20rem] overflow-visible rounded-xl border border-border bg-card p-5 shadow-2xl"
          onPointerDown={e => e.stopPropagation()}
        >
        <h3 className="mb-4 text-sm font-semibold">
          {isEdit ? "Edit Block" : "Add Manual Block"}
        </h3>

        <div className="space-y-3" dir="ltr">
          {/* Block type (create mode) */}
          {!isEdit && (
            <div>
              <label className={labelCls}>Block type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBlockType("task")}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    blockType === "task"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  Task / משימה
                </button>
                <button
                  type="button"
                  onClick={() => setBlockType("completion")}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    blockType === "completion"
                      ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  Completion / השלמה
                </button>
              </div>
            </div>
          )}

          {/* Task selector (create + task type) */}
          {!isEdit && blockType === "task" && (
            <div>
              <label className={labelCls}>Task (optional)</label>
              <select
                value={taskId}
                onChange={e => handleTaskChange(e.target.value)}
                className={inputCls}
              >
                <option value="">— No task —</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Course selector (create + completion type) */}
          {!isEdit && blockType === "completion" && (
            <div>
              <label className={labelCls}>Course</label>
              <select
                value={courseId}
                onChange={e => {
                  setCourseId(e.target.value);
                  const c = courses.find(x => x.id === e.target.value);
                  if (c) setTitle(c.course_name);
                }}
                className={inputCls}
              >
                <option value="">— Select course —</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          {(isEdit || blockType === "task") && (
          <div>
            <label className={labelCls}>Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Study session"
              className={inputCls}
              dir="auto"
              disabled={isEdit}
            />
          </div>
          )}

          {/* Date */}
          <div className="min-w-0">
            <label className={labelCls}>Date</label>
            <DateSelect
              value={date}
              onChange={setDate}
            />
          </div>

          {/* Start / End times — side by side */}
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className={labelCls}>Start</label>
              <TimeSelect
                value={start}
                onChange={setStart}
                minuteStep={isEdit ? 1 : 15}
                className="w-full justify-center"
              />
            </div>
            <div className="min-w-0">
              <label className={labelCls}>End</label>
              <TimeSelect
                value={end}
                onChange={setEnd}
                minuteStep={isEdit ? 1 : 15}
                className="w-full justify-center"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : isEdit ? "Save" : "Add Block"}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── CalendarGrid — drag, resize, delete, focus-mode ─────────────────────────

type InteractionKind = "drag" | "resize";

interface ActiveInteraction {
  kind:          InteractionKind;
  blockId:       string;
  pointerStartY: number;
  pointerStartX: number;
  origStartMin:  number;
  origEndMin:    number;
  origDayIndex:  number;
}

interface Preview {
  blockId:  string;
  startMin: number;
  endMin:   number;
  dayIndex: number;
}

function resolveDayIndex(clientX: number, clientY: number): number | null {
  const el  = document.elementFromPoint(clientX, clientY);
  const col = el?.closest("[data-day-col]");
  if (!col) return null;
  const idx = col.getAttribute("data-day-col");
  return idx !== null ? parseInt(idx, 10) : null;
}


function CalendarGrid({
  days,
  dayKeys,
  blocks,
  weeklyGoals,
  completedGoalKeys,
  todayStr,
  onBlockDrop,
  onBlockResize,
  onBlockDelete,
  onBlockEdit,
}: {
  days:           Date[];
  /** Canonical YYYY-MM-DD keys aligned with `days` indices */
  dayKeys:        string[];
  blocks:         CalendarBlock[];
  /** Per-day goal entries (index 0 = days[0], …). undefined hides the summary row. */
  weeklyGoals?:   LiveDailyGoalEntry[][];
  completedGoalKeys: Set<string>;
  /** Profile-timezone calendar day — matches server reset semantics */
  todayStr:       string;
  onBlockDrop?:   (blockId: string, newDate: string, newStart: string, newEnd: string) => void;
  onBlockResize?: (blockId: string, newEnd: string) => void;
  onBlockDelete?: (blockId: string) => void;
  onBlockEdit?:   (block: CalendarBlock) => void;
}) {
  const { translate, locale } = useLanguage();
  const today    = new Date();
  const colCount = days.length;

  const sampleTourBlockId =
    blocks.find((b) => b.kind === "ai" || b.kind === "manual" || b.kind === "one_off")?.id ?? null;

  // Focus Mode: when ANY draft block exists, dim all previously-approved blocks
  // so the user's eye is drawn to what the AI is currently proposing.
  const hasDrafts = blocks.some(b => b.kind === "ai" && !b.is_locked);

  // All interaction state lives in a ref (no stale closures) + a preview state for rendering
  const interactionRef = useRef<ActiveInteraction | null>(null);
  const onDropRef      = useRef(onBlockDrop);
  const onResizeRef    = useRef(onBlockResize);
  const daysRef        = useRef(days);
  onDropRef.current    = onBlockDrop;
  onResizeRef.current  = onBlockResize;
  daysRef.current      = days;

  const [preview, setPreview] = useState<Preview | null>(null);
  // Mirror preview in a ref so the pointerup handler can read it without
  // a stale closure AND without calling setState inside a state-updater,
  // which triggers "Cannot update a component while rendering another".
  const previewRef = useRef<Preview | null>(null);
  previewRef.current = preview;

  // Single effect: attach document-level pointer listeners once
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ix = interactionRef.current;
      if (!ix) return;

      const deltaY   = e.clientY - ix.pointerStartY;
      const rawDelta = (deltaY / HOUR_HEIGHT) * 60;
      const snapped  = Math.round(rawDelta / SNAP_MIN) * SNAP_MIN;

      if (ix.kind === "drag") {
        const dur      = ix.origEndMin - ix.origStartMin;
        const newStart = Math.max(GRID_START, Math.min(GRID_END - dur, ix.origStartMin + snapped));
        const dayIdx   = resolveDayIndex(e.clientX, e.clientY) ?? ix.origDayIndex;
        setPreview({ blockId: ix.blockId, startMin: newStart, endMin: newStart + dur, dayIndex: dayIdx });
      } else {
        // resize: only the end moves; minimum duration enforced
        const newEnd = Math.max(
          ix.origStartMin + MIN_DURATION,
          Math.min(GRID_END, ix.origEndMin + snapped)
        );
        setPreview({ blockId: ix.blockId, startMin: ix.origStartMin, endMin: newEnd, dayIndex: ix.origDayIndex });
      }
    };

    const onUp = () => {
      const ix = interactionRef.current;
      if (!ix) return;
      interactionRef.current = null;

      // Read the current preview value from the ref (always fresh, no stale closure).
      // Then immediately clear the preview state with a plain set (no functional updater).
      // Using a functional updater here caused "Cannot update a component (PlannerCalendar)
      // while rendering a different component (CalendarGrid)" because the updater function
      // called the parent onDrop/onResize callbacks — which set state in PlannerCalendar —
      // while React was still processing CalendarGrid's state update.
      const prev = previewRef.current;
      setPreview(null);

      if (!prev || prev.blockId !== ix.blockId) return;

      // Defer parent state updates to the next macrotask so they never fire
      // synchronously inside a React render phase.
      setTimeout(() => {
        const visibleDays = daysRef.current;
        if (ix.kind === "drag") {
          const origDate = format(visibleDays[ix.origDayIndex], "yyyy-MM-dd");
          const newDate  = format(visibleDays[prev.dayIndex], "yyyy-MM-dd");
          if (prev.startMin !== ix.origStartMin || newDate !== origDate) {
            onDropRef.current?.(
              ix.blockId,
              newDate,
              minToTime(prev.startMin),
              minToTime(prev.endMin),
            );
          }
        } else {
          if (prev.endMin !== ix.origEndMin) {
            onResizeRef.current?.(ix.blockId, minToTime(prev.endMin));
          }
        }
      }, 0);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup",   onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup",   onUp);
    };
  }, []); // empty deps — all live values via refs

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div style={{ minWidth: colCount === 1 ? 0 : Math.max(600, colCount * 72) }}>
        {/* Day headers */}
        <div className="grid border-b border-border"
          style={{ gridTemplateColumns: `3rem repeat(${colCount}, 1fr)` }}>
          <div />
          {days.map((d, i) => (
            <div key={i} className={i < colCount - 1 ? "border-r border-border" : ""}>
              <DayHeader
                date={d}
                isToday={isSameDay(d, today)}
                isPast={format(d, "yyyy-MM-dd") < todayStr}
              />
            </div>
          ))}
        </div>

        {/* Hour labels + day columns */}
        <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${colCount}, 1fr)` }}>
          {/* Hour labels */}
          <div>
            {HOURS.map((hour, hi) => (
              <div key={hour}
                className={["h-12", hi < HOURS.length - 1 ? "border-b border-border" : ""].join(" ")}>
                <div className="flex items-start justify-end pr-2 pt-1 text-[11px] font-mono text-muted-foreground/55">
                  {String(hour).padStart(2, "0")}:00
                </div>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => {
            const dayStr = dayKeys[di] ?? toDateKey(day);
            const isPastDay = dayStr < todayStr;

            const dayBlocks = blocks.filter((b) => {
              if (toDateKey(b.scheduled_date) !== dayStr) return false;
              if (preview?.blockId === b.id && preview.dayIndex !== di) return false;
              return true;
            });

            const draggedHere = preview && preview.dayIndex === di
              ? blocks.find((b) => b.id === preview.blockId)
              : null;

            return (
              <div
                key={di}
                data-day-col={di}
                className={["relative",
                  di < colCount - 1 ? "border-r border-border" : "",
                  isSameDay(day, today) ? "bg-primary/[0.03]" : "",
                  isPastDay ? "bg-muted/15" : "",
                ].join(" ")}
                style={{ height: TOTAL_HEIGHT }}>

                {HOURS.map((_, hi) => hi < HOURS.length - 1 ? (
                  <div key={hi}
                    className="pointer-events-none absolute w-full border-b border-dashed border-border/50"
                    style={{ top: (hi + 1) * HOUR_HEIGHT }} />
                ) : null)}

                {dayBlocks.map((block) => {
                  const isBeingInteracted = preview?.blockId === block.id && preview.dayIndex === di;
                  const startMin = isBeingInteracted ? preview!.startMin : hhmm(block.start_time);
                  const endMin   = isBeingInteracted ? preview!.endMin   : hhmm(block.end_time);

                  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
                  if (endMin <= GRID_START || startMin >= GRID_END) return null;

                  const cs  = Math.max(startMin, GRID_START);
                  const ce  = Math.min(endMin, GRID_END);
                  const top = ((cs - GRID_START) / 60) * HOUR_HEIGHT;
                  const ht  = Math.max(BLOCK_MIN_HEIGHT, ((ce - cs) / 60) * HOUR_HEIGHT - 2);

                  const interactivity = getBlockInteractivity(block, todayStr, completedGoalKeys);
                  const canDrag       = interactivity === "full" || interactivity === "drag-only";
                  const canResize     = interactivity === "full";
                  const canEditDelete = interactivity === "full";
                  const isActive      = preview?.blockId === block.id;
                  const interactKind  = interactionRef.current?.kind;
                  const isFocusDimmed = hasDrafts && block.kind === "ai" && block.is_locked;
                  const missed        = isMissedBlock(block, todayStr, completedGoalKeys);
                  const isReadonly    = interactivity === "readonly";

                  return (
                    <div
                      key={block.id}
                      data-tour={block.id === sampleTourBlockId ? "schedule-block-sample" : undefined}
                      title={block.title}
                      className={[
                        "group absolute inset-x-0.5 flex min-h-[24px] flex-col overflow-hidden rounded-md text-[10px] font-medium leading-tight transition-opacity duration-200",
                        blockClass(block, missed),
                        canDrag ? "cursor-grab select-none" : "",
                        isReadonly ? "opacity-80" : "",
                        isActive && interactKind === "drag"   ? "opacity-75 cursor-grabbing shadow-lg z-10 ring-2 ring-primary" : "",
                        isActive && interactKind === "resize" ? "opacity-90 z-10" : "",
                        isFocusDimmed && !missed ? "opacity-60 shadow-none" : "",
                      ].join(" ")}
                      style={{ top, height: ht }}
                      onPointerDown={canDrag ? (e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("[data-resize-handle]")) return;
                        if (target.closest("button")) return;
                        e.preventDefault();
                        interactionRef.current = {
                          kind:          "drag",
                          blockId:       block.id,
                          pointerStartY: e.clientY,
                          pointerStartX: e.clientX,
                          origStartMin:  startMin,
                          origEndMin:    endMin,
                          origDayIndex:  di,
                        };
                        setPreview({ blockId: block.id, startMin, endMin, dayIndex: di });
                      } : undefined}
                    >
                      {canDrag && (
                        <div
                          data-drag-handle="1"
                          className="flex h-4 shrink-0 cursor-grab items-center justify-center border-b border-black/5 bg-black/[0.04] active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.06]"
                          aria-hidden
                        >
                          <GripVertical className="h-3 w-3 opacity-40" />
                        </div>
                      )}
                      {/* Block header — flex row so action icons never overlap text in RTL or LTR */}
                      <div className="flex min-h-0 flex-1 items-start gap-1 px-1.5 py-0.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            {missed && (
                              <AlertTriangle
                                className="h-2.5 w-2.5 shrink-0 text-red-600 dark:text-red-400"
                                aria-hidden
                              />
                            )}
                            {(block.kind === "fixed" || block.kind === "class_override") && (
                              <GraduationCap className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
                            )}
                            <AutoDirText className="block truncate">{block.title}</AutoDirText>
                          </div>
                          <TimeRange
                            start={minToTime(startMin)}
                            end={minToTime(endMin)}
                            className="opacity-70"
                          />
                        </div>

                        {/* Action buttons — future blocks only */}
                        {canEditDelete && (
                          <div className="hidden shrink-0 gap-px group-hover:flex">
                            <button
                              type="button"
                              aria-label="Edit block time"
                              onClick={(e) => {
                                e.stopPropagation();
                                onBlockEdit?.(block);
                              }}
                              className="flex items-center justify-center rounded p-0.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              data-delete-btn="1"
                              aria-label="Delete block"
                              onClick={(e) => {
                                e.stopPropagation();
                                onBlockDelete?.(block.id);
                              }}
                              className="flex items-center justify-center rounded p-0.5 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Resize handle — future blocks only */}
                      {canResize && ht >= BLOCK_MIN_HEIGHT && (
                        <div
                          data-resize-handle="1"
                          aria-label="Resize block"
                          className={[
                            "absolute bottom-0 left-0 right-0 h-2 cursor-s-resize",
                            "bg-primary/30 opacity-0 group-hover:opacity-100 hover:bg-primary/60",
                            "rounded-b-md transition-opacity",
                          ].join(" ")}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            interactionRef.current = {
                              kind:          "resize",
                              blockId:       block.id,
                              pointerStartY: e.clientY,
                              pointerStartX: e.clientX,
                              origStartMin:  startMin,
                              origEndMin:    endMin,
                              origDayIndex:  di,
                            };
                            setPreview({
                              blockId:  block.id,
                              startMin,
                              endMin,
                              dayIndex: di,
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Ghost preview when block is dragged in from another day column */}
                {draggedHere && preview && !dayBlocks.some((b) => b.id === draggedHere.id) && (() => {
                  const startMin = preview.startMin;
                  const endMin   = preview.endMin;
                  if (endMin <= GRID_START || startMin >= GRID_END) return null;
                  const cs  = Math.max(startMin, GRID_START);
                  const ce  = Math.min(endMin, GRID_END);
                  const top = ((cs - GRID_START) / 60) * HOUR_HEIGHT;
                  const ht  = Math.max(BLOCK_MIN_HEIGHT, ((ce - cs) / 60) * HOUR_HEIGHT - 2);
                  return (
                    <div
                      key={`preview-${draggedHere.id}`}
                      className={[
                        "pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md text-[10px] font-medium leading-tight",
                        blockClass(draggedHere, isMissedBlock(draggedHere, todayStr, completedGoalKeys)),
                        "opacity-75 ring-2 ring-primary z-10",
                      ].join(" ")}
                      style={{ top, height: ht }}
                    >
                      <div className="px-1.5 py-0.5">
                        <AutoDirText className="block truncate">{draggedHere.title}</AutoDirText>
                        <TimeRange
                          start={minToTime(startMin)}
                          end={minToTime(endMin)}
                          className="opacity-70"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* ── Weekly Goals Summary row — always visible ─────────────────── */}
        {weeklyGoals && (
          <div className="border-t border-border/60" data-tour="daily-goals-row">
            <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${colCount}, 1fr)` }}>
              {/* "Goals" label in the hour-label column */}
              <div className="flex items-start justify-end pb-2 pr-2 pt-2.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 leading-none">
                  {translate("goalsLabel")}
                </span>
              </div>

              {/* One cell per visible day */}
              {days.map((_, di) => {
                const entries = weeklyGoals[di] ?? [];
                return (
                  <div
                    key={di}
                    className={[
                      "min-h-[2.5rem] p-1",
                      di < colCount - 1 ? "border-r border-border/60" : "",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-[3px]">
                      {entries.map(g => (
                        <div
                          key={g.taskId}
                          className={[
                            "overflow-hidden rounded-[4px] px-1.5 py-[2px]",
                            g.isSessionDone ? "bg-emerald-500/10" : "bg-primary/10",
                          ].join(" ")}
                        >
                          <div className="flex flex-row items-center justify-between gap-1">
                            <AutoDirText className="min-w-0 truncate text-[9px] font-medium text-primary/80">
                              {g.taskTitle}
                            </AutoDirText>
                            <PercentValue
                              value={g.plannedPct}
                              className={[
                                "text-[9px] font-bold shrink-0",
                                g.isSessionDone ? "text-emerald-600 dark:text-emerald-400" : "text-primary",
                              ].join(" ")}
                            />
                          </div>
                          <div className="relative mt-0.5 h-1 w-full overflow-hidden rounded-full bg-primary/15">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-primary/45"
                              style={{ width: `${g.plannedPct}%` }}
                            />
                            {g.finishedPct > 0 && (
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/80"
                                style={{ width: `${g.finishedPct}%` }}
                              />
                            )}
                          </div>
                          {g.isSessionDone && (
                            <span className="mt-0.5 block text-end text-[8px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {translate("doneLabel")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Smart Sync card ──────────────────────────────────────────────────────────
function SmartSyncCard({
  hasDraftBlocks,
  planStartDate,
  planEndDate,
  onSuccess,
  onDiscard,
}: {
  hasDraftBlocks: boolean;
  planStartDate:  string;
  planEndDate:    string;
  onSuccess: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
}) {
  const { translate } = useLanguage();
  const onboarding = useOnboardingOptional();
  const [constraints,  setConstraints]  = useState("");
  const [loading,      setLoading]      = useState(false);
  const [aiMessage,    setAiMessage]    = useState<string | null>(null);
  const [conflict,     setConflict]     = useState<PlannerConflictState | null>(null);
  const [wasApproved,  setWasApproved]  = useState(false);
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [approving,    startApprove]    = useTransition();
  const [discarding,   startDiscard]    = useTransition();
  const [undoing,      startUndo]       = useTransition();

  const busy = loading || approving || discarding || undoing || acceptingIdx !== null;

  const handleGenerate = async () => {
    setLoading(true);
    setAiMessage(null);
    setConflict(null);
    try {
      const result = await generateSchedulePlan(constraints.trim());
      if (!result.success) {
        toast.error(result.error ?? "Plan generation failed.");
        return;
      }
      if (result.status === "conflict") {
        setConflict({ message: result.message, options: result.options });
        toast.warning(translate("conflictWarning"), PLANNER_ALERT_TOAST);
        return;
      }
      const count = result.block_count ?? 0;
      toast.success(
        `${isolateLtr(count)} ${count !== 1 ? translate("blocksScheduled") : translate("blockScheduled")}`,
      );
      if (result.warnings?.length) {
        for (const w of result.warnings) toast.warning(w, PLANNER_ALERT_TOAST);
      }
      setAiMessage(result.ai_message ?? null);
      setConstraints("");
      onboarding?.signalTourAction("ai-generated");
      await onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOption = async (option: PlannerConflictOption, idx: number) => {
    setAcceptingIdx(idx);
    try {
      const result = await acceptConflictOption(option.pre_calculated_schedule);
      if (!result.success) { toast.error(result.error ?? "Failed."); return; }
      toast.success(
        `"${option.title}" — ${isolateLtr(result.block_count ?? 0)} ${translate("blocksScheduled")}`,
      );
      setConflict(null);
      onboarding?.signalTourAction("ai-generated");
      await onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setAcceptingIdx(null);
    }
  };

  const handleDiscard = () => {
    startDiscard(async () => {
      try {
        await onDiscard();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not discard plan.");
      }
    });
  };

  const handleApprove = () => {
    startApprove(async () => {
      try {
        const result = await approvePlan(planStartDate, planEndDate);
        if (!result.success) { toast.error(result.error ?? "Approval failed."); return; }
        toast.success(
          `${translate("planApproved")} (${isolateLtr(result.approved ?? 0)})`,
        );
        setWasApproved(true);
        await onSuccess();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unexpected error.");
      }
    });
  };

  const handleUndo = () => {
    startUndo(async () => {
      try {
        const result = await undoApproval();
        if (!result.success) { toast.error(result.error ?? "Nothing to undo."); return; }
        toast.success("Undo successful — task progress restored.");
        setWasApproved(false);
        await onSuccess();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unexpected error.");
      }
    });
  };

  return (
    <Card data-tour="ai-prompt-area" className="border-primary/25 bg-gradient-to-br from-primary/5 via-background to-background shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:gap-5">
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{translate("smartSyncTitle")}</p>
            <p className="text-xs text-muted-foreground">{translate("smartSyncDesc")}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="constraints" className="text-xs font-medium text-muted-foreground">
            {translate("constraintsLabel")}
          </label>
          <textarea
            id="constraints"
            value={constraints}
            onChange={e => setConstraints(e.target.value)}
            placeholder={translate("constraintsPlaceholder")}
            rows={2}
            disabled={busy}
            dir="auto"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <p
            className="mt-2 break-words rounded-md bg-red-50/50 p-2 text-[10px] leading-tight text-destructive dark:bg-red-900/20 md:text-xs"
            role="note"
          >
            <AutoDirText>{translate("generationLimitsNote")}</AutoDirText>
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button
            onClick={handleGenerate}
            disabled={busy}
            className="gap-2"
            data-tour="generate-plan"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? translate("generatingPlan") : translate("generatePlan")}
          </Button>

          {hasDraftBlocks && (
            <>
              <Button variant="outline" onClick={handleApprove} disabled={busy}
                className="gap-2 border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {approving ? translate("approvingPlan") : translate("approvePlan")}
              </Button>
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={busy}
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {discarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {discarding ? translate("discardingPlan") : translate("discardPlan")}
              </Button>
            </>
          )}

          {wasApproved && (
            <Button variant="ghost" onClick={handleUndo} disabled={busy}
              className="gap-2 text-muted-foreground hover:text-foreground text-xs">
              {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {undoing ? translate("undoingApproval") : translate("undoApproval")}
            </Button>
          )}
        </div>
      </CardContent>

      {aiMessage && !conflict && (
        <div className="border-t border-primary/10 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-primary">{translate("aiPrefix")} </span>
            <AutoDirText>{aiMessage}</AutoDirText>
          </p>
        </div>
      )}

      {/* Conflict / Dilemma Negotiation */}
      {conflict && (
        <div className="border-t border-amber-500/25 bg-amber-50/60 dark:bg-amber-950/15 px-5 py-4 rounded-b-lg">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
              <AutoDirText>{conflict.message}</AutoDirText>
            </p>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {translate("chooseApproach")}
          </p>
          <div className="flex flex-wrap gap-2">
            {conflict.options.map((opt, i) => (
              <Button key={i} size="sm" variant="outline" disabled={busy}
                onClick={() => handleAcceptOption(opt, i)}
                className="gap-1.5 border-amber-500/40 text-amber-800 hover:bg-amber-100/80 dark:text-amber-300 dark:hover:bg-amber-950/60">
                {acceptingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                {opt.title}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
export function PlannerCalendar({
  initialBlocks,
  initialHasDraftBlocks,
  tasks = [],
  courses = [],
  lockedHistoryBlocks: initialLockedHistory = [],
  completedGoalKeys: initialCompletedGoalKeys = [],
  initialWeekStart,
}: {
  initialBlocks:         CalendarBlock[];
  initialHasDraftBlocks: boolean;
  tasks?:                Task[];
  courses?:              { id: string; course_name: string }[];
  lockedHistoryBlocks?:  LockedHistoryBlock[];
  completedGoalKeys?:    string[];
  initialWeekStart:      string;
}) {
  const router = useRouter();
  const { translate } = useLanguage();
  const { toggleMobileMenu } = useSidebar();
  const onboarding = useOnboardingOptional();
  const { profile } = useUser();
  const { syncBlocks, applyWeekData: applyScheduleWeekData, progressBlocks, sessionLoggedKeys, fullyCompletedGoalKeys, completedGoalKeys: providerCompletedGoalKeys, tasks: providerTasks, goalRecords } = usePlannerSchedule();

  const plannerTimeZone = useMemo(
    () => resolvePlannerTimezone(profile?.timezone),
    [profile?.timezone],
  );

  const [todayKey, setTodayKey] = useState(() =>
    getPlannerClock(PLANNER_DEFAULT_TIMEZONE).todayStr,
  );
  const todayKeyRef = useRef(todayKey);

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => parseLocalDate(initialWeekStart));
  const weekBounds = useMemo(() => getWeekBounds(weekAnchor), [weekAnchor]);
  const days = weekBounds.days;
  const dayKeys = weekBounds.dayKeys;

  const normalizeBlocks = useCallback(
    (blocks: CalendarBlock[]) => blocks.map(normalizeCalendarBlock),
    [],
  );

  const [localBlocks, setLocalBlocks] = useState<CalendarBlock[]>(() => normalizeBlocks(initialBlocks));
  const [taskList, setTaskList] = useState<Task[]>(tasks);
  const [lockedHistory, setLockedHistory] = useState<LockedHistoryBlock[]>(initialLockedHistory);
  const [completedGoalKeys, setCompletedGoalKeys] = useState<string[]>(initialCompletedGoalKeys);
  const [hasDraftBlocks, setHasDraftBlocks] = useState(initialHasDraftBlocks);
  const [loadingWeek, setLoadingWeek] = useState(false);

  /** Week already loaded — avoids duplicate fetch when navigating back. */
  const loadedWeekStart = useRef<string | null>(null);
  const didMountFetch = useRef(false);
  /** After AI mutations: hold local state until SSR props match the client fetch. */
  const skipSsrSyncRef = useRef(false);
  const expectedDraftCountRef = useRef(0);

  const applyWeekData = useCallback((data: Awaited<ReturnType<typeof loadPlannerWeekData>>, weekStart: string) => {
    loadedWeekStart.current = weekStart;
    const draftCount = countDraftAiBlocks(data.calendarBlocks);
    if (skipSsrSyncRef.current) {
      expectedDraftCountRef.current = draftCount;
    }
    setLocalBlocks(normalizeBlocks(data.calendarBlocks));
    setLockedHistory(data.lockedHistoryBlocks);
    setCompletedGoalKeys(data.completedGoalKeys);
    setHasDraftBlocks(data.hasDraftBlocks);
    setTaskList(data.tasks);
    applyScheduleWeekData({
      blocks:                 data.calendarBlocks,
      progressBlocks:         data.progressBlocks,
      tasks:                  data.tasks,
      completedGoalKeys:      data.completedGoalKeys,
      sessionLoggedKeys:      data.sessionLoggedKeys,
      fullyCompletedGoalKeys: data.fullyCompletedGoalKeys,
      hasDraftBlocks:         data.hasDraftBlocks,
      goalRecords:            data.goalRecords,
    });
  }, [normalizeBlocks, applyScheduleWeekData]);

  const refreshCurrentWeek = useCallback(async () => {
    const { weekStart, weekEnd } = weekBounds;
    try {
      const data = await loadPlannerWeekData(weekStart, weekEnd);
      applyWeekData(data, weekStart);
      return data;
    } catch {
      toast.error("Could not load week data.");
      return null;
    }
  }, [weekBounds, applyWeekData]);

  const syncAfterPlannerMutation = useCallback(async () => {
    skipSsrSyncRef.current = true;
    await refreshCurrentWeek();
    router.refresh();
  }, [refreshCurrentWeek, router]);

  // Keep todayKey aligned with profile timezone (same as server reset semantics).
  useEffect(() => {
    const next = getPlannerClock(plannerTimeZone).todayStr;
    if (next === todayKeyRef.current) return;
    todayKeyRef.current = next;
    setTodayKey(next);
  }, [plannerTimeZone]);

  // Midnight rollover — refetch week blocks when the profile-timezone calendar day changes.
  useEffect(() => {
    const tick = () => {
      const next = getPlannerClock(plannerTimeZone).todayStr;
      if (next === todayKeyRef.current) return;
      todayKeyRef.current = next;
      setTodayKey(next);
      loadedWeekStart.current = null;
      const { weekStart } = getWeekBounds(parseLocalDate(next));
      setWeekAnchor(parseLocalDate(weekStart));
      void refreshCurrentWeek();
    };

    const id = window.setInterval(tick, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshCurrentWeek, plannerTimeZone]);

  // Client fetch on mount — SSR props may be empty/stale; this matches post-AI refresh path.
  useEffect(() => {
    if (didMountFetch.current) return;
    didMountFetch.current = true;
    void refreshCurrentWeek();
  }, [refreshCurrentWeek]);

  useEffect(() => {
    const { weekStart, weekEnd } = weekBounds;

    if (loadedWeekStart.current === weekStart) return;

    let cancelled = false;
    setLoadingWeek(true);
    loadPlannerWeekData(weekStart, weekEnd)
      .then((data) => {
        if (cancelled) return;
        applyWeekData(data, weekStart);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load week data.");
      })
      .finally(() => {
        if (!cancelled) setLoadingWeek(false);
      });

    return () => { cancelled = true; };
  }, [weekBounds.weekStart, weekBounds.weekEnd, applyWeekData]);

  // Sync SSR props when router.refresh updates the initial week — never clobber fresher client state.
  useEffect(() => {
    if (weekBounds.weekStart !== initialWeekStart) return;

    const initialDrafts = countDraftAiBlocks(initialBlocks);
    const localDrafts = countDraftAiBlocks(localBlocks);

    const syncMetadataOnly = () => {
      setLockedHistory(initialLockedHistory);
      setCompletedGoalKeys(initialCompletedGoalKeys);
      setTaskList(tasks);
    };

    if (skipSsrSyncRef.current) {
      if (initialDrafts !== expectedDraftCountRef.current) {
        syncMetadataOnly();
        return;
      }
      skipSsrSyncRef.current = false;
    } else if (localDrafts > initialDrafts) {
      syncMetadataOnly();
      return;
    } else if (localDrafts < initialDrafts) {
      // Draft(s) removed locally (delete/discard) — don't restore from stale SSR props.
      syncMetadataOnly();
      return;
    }

    const normalizedInitial = normalizeBlocks(initialBlocks);
    if (!calendarBlocksEqual(normalizedInitial, localBlocks)) {
      setLocalBlocks(normalizedInitial);
    }
    setLockedHistory(initialLockedHistory);
    setCompletedGoalKeys(initialCompletedGoalKeys);
    setHasDraftBlocks(initialHasDraftBlocks);
    setTaskList(tasks);
  }, [
    weekBounds.weekStart,
    initialWeekStart,
    initialBlocks,
    localBlocks,
    initialLockedHistory,
    initialCompletedGoalKeys,
    initialHasDraftBlocks,
    tasks,
    normalizeBlocks,
  ]);

  const completedGoals = useMemo(
    () => new Set(completedGoalKeys),
    [completedGoalKeys],
  );

  const hasDraftLocal = localBlocks.some(b => b.kind === "ai" && !b.is_locked);
  const hasDrafts     = hasDraftBlocks || hasDraftLocal;

  /** Same filtered array passed to CalendarGrid — goals must mirror visible timeline blocks */
  const timelineBlocks = useMemo(
    () => buildTimelineBlocks(localBlocks, hasDrafts, todayKey, completedGoals, isMissedBlock),
    [localBlocks, hasDrafts, todayKey, completedGoals],
  );

  useEffect(() => {
    syncBlocks(
      localBlocks,
      hasDrafts,
      completedGoalKeys,
      weekBounds.weekStart,
      weekBounds.weekEnd,
    );
  }, [localBlocks, hasDrafts, completedGoalKeys, syncBlocks, weekBounds.weekStart, weekBounds.weekEnd]);

  // ── Weekly goals — recomputes on every localBlocks change (DnD / resize) ─────
  const effectiveTasks = providerTasks.length > 0 ? providerTasks : taskList;

  const tasksById = useMemo(
    () => new Map(effectiveTasks.map(t => [String(t.id).trim(), t])),
    [effectiveTasks],
  );

  const weeklyGoalsByDay = useMemo(() => {
    const sessionLogged = new Set(
      sessionLoggedKeys.length > 0 ? sessionLoggedKeys : completedGoalKeys,
    );
    const fullyCompleted = new Set(fullyCompletedGoalKeys);
    const missedCleared  = new Set(
      providerCompletedGoalKeys.length > 0 ? providerCompletedGoalKeys : completedGoalKeys,
    );

    return computeLiveDailyGoals(
      dayKeys,
      timelineBlocks,
      progressBlocks,
      tasksById,
      sessionLogged,
      fullyCompleted,
      missedCleared,
      todayKey,
    );
  }, [
    dayKeys,
    timelineBlocks,
    progressBlocks,
    tasksById,
    sessionLoggedKeys,
    fullyCompletedGoalKeys,
    providerCompletedGoalKeys,
    completedGoalKeys,
    todayKey,
  ]);

  const handlePrevWeek = () => setWeekAnchor((a) => subDays(a, 7));
  const handleNextWeek = () => setWeekAnchor((a) => addDays(a, 7));
  const handleToday    = () => {
    const { weekStart } = getWeekBounds(new Date());
    setWeekAnchor(parseLocalDate(weekStart));
  };

  // ── Reset current view range ───────────────────────────────────────────────
  const [resetting, setResetting] = useState(false);

  const handleResetWeek = async () => {
    setResetting(true);
    const clock = getPlannerClock(plannerTimeZone);
    const protectedTaskIds = protectedTaskIdsFromGoalRecords(goalRecords, clock.todayStr);
    const result = await clearPlannerRange(clock.todayStr);
    setResetting(false);

    if (!result.success) {
      toast.error(`Reset failed: ${result.error}`);
      return;
    }

    setLocalBlocks((prev) =>
      filterBlocksAfterPlannerReset(prev, clock.todayStr, clock.nowMin, protectedTaskIds),
    );
    toast.success(`${translate("boardCleared")} (${isolateLtr(result.deleted ?? 0)})`);
    router.refresh();
  };

  // ── Drag: move entire block ────────────────────────────────────────────────
  const handleBlockDrop = async (
    blockId: string,
    newDate: string,
    newStart: string,
    newEnd: string,
  ) => {
    const original = localBlocks.find(b => b.id === blockId);
    if (!original) return;

    if (isVirtualClassBlock(original)) {
      const parsed = parseVirtualClassBlockId(blockId);
      const sourceScheduleId = original.source_schedule_id ?? parsed?.scheduleId;
      const originalDate     = parsed?.date ?? original.scheduled_date;
      if (!sourceScheduleId) return;

      setLocalBlocks(prev => prev.filter(b => b.id !== blockId).concat({
        id:                 `temp-override-${blockId}`,
        kind:               "class_override",
        title:              original.title,
        scheduled_date:     newDate,
        start_time:         newStart,
        end_time:           newEnd,
        is_locked:          true,
        task_id:            null,
        source_schedule_id: sourceScheduleId,
        is_virtual:         false,
      }));

      onboarding?.signalTourAction("block-dragged");

      const result = await moveVirtualClassInstance({
        sourceScheduleId,
        originalDate,
        scheduledDate: newDate,
        startTime:     newStart,
        endTime:       newEnd,
        title:         original.title,
      });

      if (!result.success) {
        toast.error(`Could not move class: ${result.error}`);
        setLocalBlocks(prev => prev.filter(b => b.id !== `temp-override-${blockId}`).concat(original));
        return;
      }

      skipSsrSyncRef.current = true;
      await syncAfterPlannerMutation();
      return;
    }

    if (original.kind === "class_override") {
      setLocalBlocks(prev => prev.map(b =>
        b.id === blockId
          ? { ...b, scheduled_date: newDate, start_time: newStart, end_time: newEnd }
          : b
      ));
      const result = await updateBlockTime(blockId, newStart, newEnd, newDate);
      if (!result.success) {
        toast.error(`Could not save class move: ${result.error}`);
        setLocalBlocks(prev => prev.map(b => b.id === blockId ? original : b));
      }
      return;
    }

    setLocalBlocks(prev => prev.map(b =>
      b.id === blockId
        ? { ...b, scheduled_date: newDate, start_time: newStart, end_time: newEnd }
        : b
    ));
    // Optimistic move — advance drag tour immediately so overlay never blocks follow-up
    onboarding?.signalTourAction("block-dragged");
    const result = await updateBlockTime(blockId, newStart, newEnd, newDate);
    if (!result.success) {
      toast.error(`Could not save block position: ${result.error}`);
      if (original) {
        setLocalBlocks(prev => prev.map(b =>
          b.id === blockId
            ? {
                ...b,
                scheduled_date: original.scheduled_date,
                start_time:     original.start_time,
                end_time:       original.end_time,
              }
            : b
        ));
      }
    }
  };

  // ── Resize: change end time only ──────────────────────────────────────────
  const handleBlockResize = async (blockId: string, newEnd: string) => {
    const original = localBlocks.find(b => b.id === blockId);
    if (!original) return;

    if (isVirtualClassBlock(original)) {
      const parsed = parseVirtualClassBlockId(blockId);
      const sourceScheduleId = original.source_schedule_id ?? parsed?.scheduleId;
      const originalDate     = parsed?.date ?? original.scheduled_date;
      if (!sourceScheduleId) return;

      const result = await moveVirtualClassInstance({
        sourceScheduleId,
        originalDate,
        scheduledDate: original.scheduled_date,
        startTime:     original.start_time.slice(0, 5),
        endTime:       newEnd,
        title:         original.title,
      });

      if (!result.success) {
        toast.error(`Could not resize class: ${result.error}`);
        return;
      }

      skipSsrSyncRef.current = true;
      await syncAfterPlannerMutation();
      return;
    }

    setLocalBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, end_time: newEnd } : b
    ));
    const result = await updateBlockTime(blockId, original.start_time, newEnd);
    if (!result.success) {
      toast.error(`Could not save resize: ${result.error}`);
      setLocalBlocks(prev => prev.map(b =>
        b.id === blockId ? { ...b, end_time: original.end_time } : b
      ));
    }
  };

  // ── Manual block creation ─────────────────────────────────────────────────
  const [creatingBlock, setCreatingBlock] = useState(false);

  const handleCreateBlock = async (data: {
    block_kind:     "manual" | "one_off";
    task_id:        string | null;
    title:          string;
    scheduled_date: string;
    start_time:     string;
    end_time:       string;
  }) => {
    const result = await createManualBlock({
      task_id:        data.task_id,
      title:          data.title,
      scheduled_date: data.scheduled_date,
      start_time:     data.start_time,
      end_time:       data.end_time,
      kind:           data.block_kind,
    });
    if (!result.success) {
      toast.error(`Could not add block: ${result.error}`);
      return;
    }
    const newBlock: CalendarBlock = {
      id:             (result.block as { id: string }).id,
      kind:           data.block_kind,
      title:          data.title,
      scheduled_date: data.scheduled_date,
      start_time:     data.start_time,
      end_time:       data.end_time,
      is_locked:      true,
      task_id:        data.task_id,
    };
    setLocalBlocks(prev => [...prev, newBlock]);
    toast.success("Block added.");
    router.refresh();
  };

  // ── Edit (manual time adjustment) ────────────────────────────────────────
  const [editingBlock, setEditingBlock] = useState<CalendarBlock | null>(null);

  const handleBlockEdit = async (
    blockId: string,
    newStart: string,
    newEnd: string,
    newDate: string,
  ) => {
    const original = localBlocks.find(b => b.id === blockId);
    if (!original) return;

    if (isVirtualClassBlock(original)) {
      const parsed = parseVirtualClassBlockId(blockId);
      const sourceScheduleId = original.source_schedule_id ?? parsed?.scheduleId;
      const originalDate     = parsed?.date ?? original.scheduled_date;
      if (!sourceScheduleId) return;

      const result = await moveVirtualClassInstance({
        sourceScheduleId,
        originalDate,
        scheduledDate: newDate,
        startTime:     newStart,
        endTime:       newEnd,
        title:         original.title,
      });

      if (!result.success) {
        toast.error(`Could not edit class: ${result.error}`);
        return;
      }

      skipSsrSyncRef.current = true;
      await syncAfterPlannerMutation();
      return;
    }

    if (original.kind === "class_override") {
      setLocalBlocks(prev => prev.map(b =>
        b.id === blockId
          ? { ...b, scheduled_date: newDate, start_time: newStart, end_time: newEnd }
          : b
      ));
      const result = await updateBlockTime(blockId, newStart, newEnd, newDate);
      if (!result.success) {
        toast.error(`Could not save edit: ${result.error}`);
        setLocalBlocks(prev => prev.map(b => b.id === blockId ? original : b));
      }
      return;
    }

    setLocalBlocks(prev => prev.map(b =>
      b.id === blockId
        ? { ...b, scheduled_date: newDate, start_time: newStart, end_time: newEnd }
        : b
    ));
    const result = await updateBlockTime(blockId, newStart, newEnd, newDate);
    if (!result.success) {
      toast.error(`Could not save edit: ${result.error}`);
      if (original) {
        setLocalBlocks(prev => prev.map(b =>
          b.id === blockId
            ? {
                ...b,
                scheduled_date: original.scheduled_date,
                start_time:     original.start_time,
                end_time:       original.end_time,
              }
            : b
        ));
      }
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleBlockDelete = async (blockId: string) => {
    const original = localBlocks.find(b => b.id === blockId);
    if (!original) return;

    if (isVirtualClassBlock(original)) {
      const parsed = parseVirtualClassBlockId(blockId);
      const sourceScheduleId = original.source_schedule_id ?? parsed?.scheduleId;
      const instanceDate     = parsed?.date ?? original.scheduled_date;
      if (!sourceScheduleId) return;

      setLocalBlocks(prev => prev.filter(b => b.id !== blockId));

      const result = await cancelVirtualClassInstance(
        sourceScheduleId,
        instanceDate,
        original.title,
      );

      if (!result.success) {
        toast.error(`Could not cancel class: ${result.error}`);
        setLocalBlocks(prev => [...prev, original]);
        return;
      }

      skipSsrSyncRef.current = true;
      await syncAfterPlannerMutation();
      return;
    }

    if (original.kind === "class_override") {
      setLocalBlocks(prev => prev.filter(b => b.id !== blockId));

      const result = await revertClassOverride(blockId);
      if (!result.success) {
        toast.error(`Could not remove class override: ${result.error}`);
        setLocalBlocks(prev => [...prev, original]);
        return;
      }

      skipSsrSyncRef.current = true;
      await syncAfterPlannerMutation();
      return;
    }

    const persisted = isPersistedBlockId(blockId);

    setLocalBlocks(prev => {
      const next = prev.filter(b => b.id !== blockId);
      setHasDraftBlocks(next.some(b => b.kind === "ai" && !b.is_locked));
      return next;
    });

    if (!persisted) {
      return;
    }

    const result = await deleteBlock(blockId);
    if (!result.success) {
      toast.error(`Could not delete block: ${result.error}`);
      setLocalBlocks(prev => {
        const next = [...prev, original];
        setHasDraftBlocks(next.some(b => b.kind === "ai" && !b.is_locked));
        return next;
      });
      return;
    }

    expectedDraftCountRef.current = countDraftAiBlocks(
      localBlocks.filter(b => b.id !== blockId),
    );
    skipSsrSyncRef.current = true;
    await syncAfterPlannerMutation();
  };

  const handleDiscardPlan = async () => {
    setLocalBlocks(prev => prev.filter(b => !(b.kind === "ai" && !b.is_locked)));
    setHasDraftBlocks(false);
    expectedDraftCountRef.current = 0;

    const result = await discardDraftPlan();
    if (!result.success) {
      toast.error(result.error ?? "Could not discard plan.");
      await refreshCurrentWeek();
      return;
    }

    toast.success(translate("planDiscarded"));
    skipSsrSyncRef.current = true;
    await syncAfterPlannerMutation();
  };

  const planHorizon = getPlanHorizon();
  const hasAnyStudyBlock = localBlocks.some(b =>
    b.kind === "ai" || b.kind === "manual" || b.kind === "one_off",
  );

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 flex justify-start border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={toggleMobileMenu}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <SmartSyncCard
        hasDraftBlocks={hasDrafts}
        planStartDate={planHorizon.startDate}
        planEndDate={planHorizon.endDate}
        onSuccess={syncAfterPlannerMutation}
        onDiscard={handleDiscardPlan}
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary shrink-0" />
          <Toolbar
            weekDays={days}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onToday={handleToday}
            onReset={handleResetWeek}
            resetting={resetting}
            onAddBlock={() => setCreatingBlock(true)}
            loadingWeek={loadingWeek}
          />
        </div>

        <CalendarGrid
          days={days}
          dayKeys={dayKeys}
          blocks={timelineBlocks}
          weeklyGoals={weeklyGoalsByDay}
          completedGoalKeys={completedGoals}
          todayStr={todayKey}
          onBlockDrop={handleBlockDrop}
          onBlockResize={handleBlockResize}
          onBlockDelete={handleBlockDelete}
          onBlockEdit={setEditingBlock}
        />

        {hasAnyStudyBlock && (
          <p className="text-center text-[11px] text-muted-foreground/70">
            Drag to move · Drag bottom edge to resize · Hover to edit or delete · Snap: 15 min
          </p>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary/20 ring-1 ring-primary/30" />
            AI draft
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400/25 ring-1 ring-emerald-500/40" />
            Approved block{hasDrafts ? " (hidden while reviewing drafts)" : " — editable"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500/15 ring-2 ring-red-500/55" />
            {translate("missedBlockLegend")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500/20 ring-1 ring-blue-500/40" />
            Fixed class
          </span>
        </div>
      </section>

      {!hasAnyStudyBlock && (
        <Card className="border-dashed border-primary/20 bg-transparent">
          <CardContent className="flex items-center gap-3 py-5 px-4">
            <Sparkles className="h-6 w-6 shrink-0 text-primary/40" />
            <p className="text-sm text-muted-foreground">
              Generated study blocks will appear here after{" "}
              <span className="font-semibold text-foreground">Generate Plan</span>.
              You can drag, resize, edit, or delete draft blocks before approving.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Modal — adjust times on an existing draft block */}
      {editingBlock && (
        <BlockFormModal
          mode={{ type: "edit", block: editingBlock }}
          tasks={tasks}
          onSaveEdit={handleBlockEdit}
          onClose={() => setEditingBlock(null)}
        />
      )}

      {/* Create Modal — add a new locked block manually */}
      {creatingBlock && (
        <BlockFormModal
          mode={{ type: "create", defaultDate: dayKeys[0] ?? toDateKey(days[0]) }}
          tasks={tasks}
          courses={courses}
          onSaveCreate={handleCreateBlock}
          onClose={() => setCreatingBlock(false)}
        />
      )}
    </div>
  );
}
