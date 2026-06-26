"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  Hourglass,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { savePlanningPreferences } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/ui/time-select";
import { useLanguage } from "@/components/providers/language-provider";
import { useOnboardingOptional } from "@/components/providers/onboarding-provider";
import { cn } from "@/lib/utils";
import type {
  DaySchedule,
  LearningStyle,
  Profile,
  SchedulingStyle,
  WeekDay,
  WeeklyHours,
} from "@/types/database";

// ── Constants ────────────────────────────────────────────────────────────────

const WEEK_DAYS: { key: WeekDay; labelKey: string; short_he: string }[] = [
  { key: "sunday",    labelKey: "sundayTxt",    short_he: "א'" },
  { key: "monday",    labelKey: "mondayTxt",    short_he: "ב'" },
  { key: "tuesday",   labelKey: "tuesdayTxt",   short_he: "ג'" },
  { key: "wednesday", labelKey: "wednesdayTxt", short_he: "ד'" },
  { key: "thursday",  labelKey: "thursdayTxt",  short_he: "ה'" },
  { key: "friday",    labelKey: "fridayTxt",    short_he: "ו'" },
  { key: "saturday",  labelKey: "saturdayTxt",  short_he: "ש'" },
];

const PRESET_INTERVALS = ["25/5", "50/10", "90/20"];

const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  sunday:    null,
  monday:    { start: "09:00", end: "21:00" },
  tuesday:   { start: "09:00", end: "21:00" },
  wednesday: { start: "09:00", end: "21:00" },
  thursday:  { start: "09:00", end: "21:00" },
  friday:    { start: "09:00", end: "14:00" },
  saturday:  null,
};

const LEARNING_STYLE_KEYS: {
  value: LearningStyle;
  labelKey: "styleVisual" | "styleReading" | "stylePractice" | "styleMixed";
}[] = [
  { value: "visual",   labelKey: "styleVisual" },
  { value: "reading",  labelKey: "styleReading" },
  { value: "practice", labelKey: "stylePractice" },
  { value: "mixed",    labelKey: "styleMixed" },
];

// ── Read-mode summary ─────────────────────────────────────────────────────────

function ReadSummary({
  profile,
  onEdit,
}: {
  profile: Profile;
  onEdit: () => void;
}) {
  const { translate, locale } = useLanguage();

  const activeDays = WEEK_DAYS.filter(
    (d) => profile.weekly_hours?.[d.key] != null
  );

  return (
    <div className="space-y-3">
        {profile.academic_background ? (
          <p className="text-sm text-foreground" dir="auto">{profile.academic_background}</p>
      ) : (
        <p className="font-sans text-sm not-italic text-muted-foreground">
          {translate("noAcademicBg")}
        </p>
      )}

      {activeDays.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeDays.map((d) => {
            const slot = profile.weekly_hours![d.key]!;
            const label = locale === "he" ? d.short_he : translate(d.labelKey as Parameters<typeof translate>[0]).slice(0, 3);
            return (
              <span key={d.key} className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                {label}{" "}
                <span className="font-mono text-muted-foreground" dir="ltr">
                  {slot.start}–{slot.end}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {profile.work_rest_interval && (
          <span>⏱ {profile.work_rest_interval}</span>
        )}
        {profile.buffer_time_minutes != null && (
          <span className="flex items-center gap-1">
            <Hourglass className="h-3 w-3" />
            {profile.buffer_time_minutes} min
          </span>
        )}
        {profile.learning_style && (
          <span>🎯 {profile.learning_style}</span>
        )}
        {profile.scheduling_style && (
          <span>📋 {profile.scheduling_style}</span>
        )}
      </div>

      {profile.hobbies_and_breaks && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {profile.hobbies_and_breaks}
        </p>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        {translate("editPrefs")}
      </button>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

interface DraftState {
  academic_background: string;
  semester_start_date: string;
  semester_end_date: string;
  weekly_hours: WeeklyHours;
  work_rest_interval: string;
  buffer_time_minutes: number;
  learning_style: LearningStyle;
  scheduling_style: SchedulingStyle;
  hobbies_and_breaks: string;
}

function buildDraft(profile: Profile): DraftState {
  return {
    academic_background: profile.academic_background ?? "",
    semester_start_date: profile.semester_start_date ?? "",
    semester_end_date:   profile.semester_end_date ?? "",
    weekly_hours: profile.weekly_hours ?? DEFAULT_WEEKLY_HOURS,
    work_rest_interval: profile.work_rest_interval ?? "50/10",
    buffer_time_minutes: profile.buffer_time_minutes ?? 15,
    learning_style: (profile.learning_style as LearningStyle) ?? "mixed",
    scheduling_style: (profile.scheduling_style as SchedulingStyle) ?? "interleaved",
    hobbies_and_breaks: profile.hobbies_and_breaks ?? "",
  };
}

function EditForm({
  profile,
  onCancel,
  onSaved,
}: {
  profile: Profile;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const { translate, locale } = useLanguage();
  const onboarding = useOnboardingOptional();

  const [draft, setDraft] = useState<DraftState>(() => buildDraft(profile));
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Interval helpers ──────────────────────────────────────────
  const isCustom = !PRESET_INTERVALS.includes(draft.work_rest_interval);
  const [customW, customR] = draft.work_rest_interval.split("/").map((n) => parseInt(n, 10) || 0);

  const setCustomInterval = (work: number, rest: number) =>
    setDraft((p) => ({ ...p, work_rest_interval: `${work}/${rest}` }));

  // ── Generic state helpers ─────────────────────────────────────
  const setField = <K extends keyof DraftState>(key: K, val: DraftState[K]) =>
    setDraft((p) => ({ ...p, [key]: val }));

  const toggleDay = (day: WeekDay, active: boolean) =>
    setDraft((p) => ({
      ...p,
      weekly_hours: { ...p.weekly_hours, [day]: active ? { start: "09:00", end: "21:00" } : null },
    }));

  const setDayTime = (day: WeekDay, field: "start" | "end", value: string) =>
    setDraft((p) => {
      const existing = p.weekly_hours[day] ?? { start: "09:00", end: "21:00" };
      return { ...p, weekly_hours: { ...p.weekly_hours, [day]: { ...existing, [field]: value } } };
    });

  const handleSave = () => {
    setError(null);
    startSave(async () => {
      const res = await savePlanningPreferences({
        academic_background: draft.academic_background.trim() || null,
        semester_start_date: draft.semester_start_date.trim() || null,
        semester_end_date:   draft.semester_end_date.trim() || null,
        weekly_hours: draft.weekly_hours,
        work_rest_interval: draft.work_rest_interval,
        buffer_time_minutes: draft.buffer_time_minutes,
        learning_style: draft.learning_style,
        scheduling_style: draft.scheduling_style,
        hobbies_and_breaks: draft.hobbies_and_breaks.trim() || null,
      });
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onboarding?.signalTourAction("preferences-saved");
      onSaved();
    });
  };

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {/* Academic background */}
      <div className="space-y-1.5">
        <Label htmlFor="acad-bg">{translate("academicBackground")}</Label>
        <Input
          id="acad-bg"
          placeholder={translate("academicBgPlaceholder")}
          value={draft.academic_background}
          onChange={(e) => setField("academic_background", e.target.value)}
          dir="auto"
        />
      </div>

      {/* Semester window — recurring classes render only within this range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="semester-start">Semester start</Label>
          <Input
            id="semester-start"
            type="date"
            value={draft.semester_start_date}
            onChange={(e) => setField("semester_start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="semester-end">Semester end</Label>
          <Input
            id="semester-end"
            type="date"
            value={draft.semester_end_date}
            onChange={(e) => setField("semester_end_date", e.target.value)}
          />
        </div>
      </div>

      {/* Weekly availability grid */}
      <div className="space-y-2">
        <Label>{translate("dailyScheduleLabel")}</Label>
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          {WEEK_DAYS.map((d) => {
            const slot: DaySchedule = draft.weekly_hours[d.key];
            const isActive = slot !== null;
            const dayLabel = locale === "he"
              ? d.short_he
              : translate(d.labelKey as Parameters<typeof translate>[0]).slice(0, 3);
            return (
              <div key={d.key} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(d.key, !isActive)}
                  disabled={saving}
                  className={cn(
                    "w-10 shrink-0 rounded-md border px-1.5 py-1 text-center text-xs font-semibold transition-colors",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground/50 line-through"
                  )}
                >
                  {dayLabel}
                </button>
                {isActive ? (
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <TimeSelect
                      value={slot.start}
                      onChange={(v) => setDayTime(d.key, "start", v)}
                      disabled={saving}
                      minuteStep={30}
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <TimeSelect
                      value={slot.end}
                      onChange={(v) => setDayTime(d.key, "end", v)}
                      disabled={saving}
                      minuteStep={30}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{translate("restDayLabel")}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Work/Rest + Buffer */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Work/Rest interval */}
        <div className="space-y-1.5">
          <Label htmlFor="work-rest">{translate("workRestLabel")}</Label>
          <select
            id="work-rest"
            value={isCustom ? "custom" : draft.work_rest_interval}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setField("work_rest_interval", "45/15");
              } else {
                setField("work_rest_interval", e.target.value);
              }
            }}
            disabled={saving}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="25/5">{translate("pomodoroLabel")}</option>
            <option value="50/10">{translate("focusLabel")}</option>
            <option value="90/20">{translate("deepWorkLabel")}</option>
            <option value="custom">{translate("customIntervalLabel")}</option>
          </select>

          {/* Custom inputs — shown only when "Custom" is selected */}
          {isCustom && (
            <div className="flex items-center gap-2 pt-1" dir="ltr">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground">{translate("workMinsLabel")}</span>
                <Input
                  type="number"
                  min={5}
                  max={180}
                  step={5}
                  value={customW || ""}
                  onChange={(e) => setCustomInterval(Number(e.target.value), customR || 10)}
                  disabled={saving}
                  className="h-8 w-16 text-center text-sm"
                />
              </div>
              <span className="mt-4 font-bold text-muted-foreground">/</span>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground">{translate("restMinsLabel")}</span>
                <Input
                  type="number"
                  min={5}
                  max={60}
                  step={5}
                  value={customR || ""}
                  onChange={(e) => setCustomInterval(customW || 50, Number(e.target.value))}
                  disabled={saving}
                  className="h-8 w-16 text-center text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Buffer time — Hourglass icon for clarity */}
        <div className="space-y-1.5">
          <Label htmlFor="buffer" className="flex items-center gap-1.5">
            <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
            {translate("bufferTimeLabel")}
          </Label>
          <Input
            id="buffer"
            type="number"
            min={0}
            max={60}
            step={5}
            value={draft.buffer_time_minutes}
            onChange={(e) => setField("buffer_time_minutes", Number(e.target.value))}
            disabled={saving}
          />
        </div>
      </div>

      {/* Learning style */}
      <div className="space-y-1.5">
        <Label>{translate("learningStyleLabel")}</Label>
        <div className="flex flex-wrap gap-2">
          {LEARNING_STYLE_KEYS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setField("learning_style", o.value)}
              disabled={saving}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                draft.learning_style === o.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {translate(o.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Scheduling style (Tier-2 task pacing) */}
      <div className="space-y-1.5">
        <Label>Scheduling style</Label>
        <div className="flex flex-wrap gap-2">
          {(["marathon", "interleaved"] as SchedulingStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setField("scheduling_style", style)}
              disabled={saving}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                draft.scheduling_style === style
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {style}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Marathon: finish one task before the next. Interleaved: rotate across tasks for variety.
        </p>
      </div>

      {/* Hobbies & breaks */}
      <div className="space-y-1.5">
        <Label htmlFor="hobbies">{translate("hobbiesLabel")}</Label>
        <textarea
          id="hobbies"
          rows={3}
          placeholder={translate("hobbiesPlaceholder")}
          value={draft.hobbies_and_breaks}
          onChange={(e) => setField("hobbies_and_breaks", e.target.value)}
          disabled={saving}
          dir="auto"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5"
          data-tour="preferences-save"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {translate("savePrefsBtn")}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function PlanningPreferencesForm({
  profile,
}: {
  profile: Profile | null;
}) {
  const { translate } = useLanguage();
  const onboarding = useOnboardingOptional();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (onboarding?.tourActive && onboarding.tourStepIndex === 1) {
      setEditing(true);
    }
  }, [onboarding?.tourActive, onboarding?.tourStepIndex]);

  return (
    <Card data-tour="learning-preferences">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          {translate("planningPrefs")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!profile ? (
          <p className="text-sm text-muted-foreground">{translate("savingLabel")}</p>
        ) : editing ? (
          <EditForm
            profile={profile}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <ReadSummary
            profile={profile}
            onEdit={() => setEditing(true)}
          />
        )}
      </CardContent>
    </Card>
  );
}
