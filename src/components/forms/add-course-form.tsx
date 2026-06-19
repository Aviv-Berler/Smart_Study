"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { saveCourseWithSchedules } from "@/app/actions/courses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TimeSelect } from "@/components/ui/time-select";
import { useLanguage } from "@/components/providers/language-provider";
import { useOnboardingOptional } from "@/components/providers/onboarding-provider";
import { cn } from "@/lib/utils";
import type { ScheduleSlotInput } from "@/app/actions/courses";
import type { CourseWithSchedules } from "@/types/database";
import type { ScheduleType } from "@/types/database";

interface SlotState extends ScheduleSlotInput {
  _id: string;
  isEditing: boolean;
}

function emptySlot(): SlotState {
  return {
    _id: crypto.randomUUID(),
    type: "lecture",
    day_of_week: 2,
    start_time: "09:00",
    duration: 120,
    isEditing: true,
  };
}

interface Props {
  onSuccess?: (course: CourseWithSchedules) => void;
}

export function AddCourseForm({ onSuccess }: Props) {
  const router = useRouter();
  const { translate } = useLanguage();
  const onboarding = useOnboardingOptional();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [slots, setSlots] = useState<SlotState[]>([emptySlot()]);

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

  const dayLabel = (v: number) => DAYS.find((d) => d.value === v)?.label ?? "";
  const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;

  const addSlot = () =>
    setSlots((prev) => [
      emptySlot(),
      ...prev.map((s) => ({ ...s, isEditing: false })),
    ]);

  const removeSlot = (id: string) =>
    setSlots((prev) => prev.filter((s) => s._id !== id));

  const toggleEdit = (id: string) =>
    setSlots((prev) =>
      prev.map((s) => ({ ...s, isEditing: s._id === id ? !s.isEditing : false }))
    );

  const updateSlot = <K extends keyof ScheduleSlotInput>(
    id: string,
    key: K,
    value: ScheduleSlotInput[K]
  ) =>
    setSlots((prev) =>
      prev.map((s) => (s._id === id ? { ...s, [key]: value } : s))
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveCourseWithSchedules({
        course_name: courseName,
        schedules: slots.map(({ type, day_of_week, start_time, duration }) => ({
          type,
          day_of_week,
          start_time,
          duration,
        })),
      });

      if (result.error) {
        setError(result.error);
      } else {
        setCourseName("");
        setSlots([emptySlot()]);
        if (result.course) {
          onSuccess?.(result.course as CourseWithSchedules);
        }
        router.refresh();
        onboarding?.signalTourAction("course-saved");
      }
    });
  };

  return (
    <Card data-tour="add-course-form">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          {translate("addCourseTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="course-name">{translate("courseNameFormLabel")} *</Label>
            <Input
              id="course-name"
              data-tour="course-name"
              placeholder={translate("courseNameFormPlaceholder")}
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{translate("weeklyScheduleSlots")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-tour="add-time-block"
                onClick={addSlot}
                disabled={isPending}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {translate("addSlotBtn")}
              </Button>
            </div>

            <div className="space-y-2">
              {slots.map((slot, index) => (
                <div
                  key={slot._id}
                  className={cn(
                    "rounded-lg border border-border transition-colors",
                    slot.isEditing ? "bg-muted/30" : "bg-card"
                  )}
                >
                  {!slot.isEditing ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 text-xs font-medium text-muted-foreground">
                        {typeLabel(slot.type)} · {dayLabel(slot.day_of_week)} · {slot.start_time} · {slot.duration}m
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleEdit(slot._id)}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSlot(slot._id)}
                          disabled={isPending}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={translate("removeSlotLabel")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {translate("slotLabel")} {slots.length - index}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleEdit(slot._id)}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          {slots.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSlot(slot._id)}
                              disabled={isPending}
                              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                              aria-label={translate("removeSlotLabel")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1" data-tour="course-type">
                          <Label className="text-xs">{translate("typeLabel")}</Label>
                          <Select
                            value={slot.type}
                            onChange={(e) =>
                              updateSlot(slot._id, "type", e.target.value as ScheduleType)
                            }
                            disabled={isPending}
                          >
                            {TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">{translate("dayLabel")}</Label>
                          <Select
                            value={slot.day_of_week}
                            onChange={(e) =>
                              updateSlot(slot._id, "day_of_week", Number(e.target.value))
                            }
                            disabled={isPending}
                          >
                            {DAYS.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </Select>
                        </div>

                        <div
                          data-tour="course-time-duration"
                          className="grid gap-3 sm:grid-cols-2 sm:col-span-2"
                        >
                          <div className="space-y-1">
                            <Label className="text-xs">{translate("startTimeLabel")}</Label>
                            <TimeSelect
                              value={slot.start_time}
                              onChange={(v) => updateSlot(slot._id, "start_time", v)}
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
                                updateSlot(slot._id, "duration", Number(e.target.value))
                              }
                              disabled={isPending}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" data-tour="course-save" disabled={isPending || !courseName.trim()}>
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{translate("savingLabel")}</>
            ) : (
              <><BookOpen className="h-4 w-4" />{translate("addCourseBtn")}</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
