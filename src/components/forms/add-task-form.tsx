"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon, Clock, Loader2, Plus } from "lucide-react";
import { addTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/components/providers/language-provider";
import { useOnboardingOptional } from "@/components/providers/onboarding-provider";
import type { Task } from "@/types/database";

interface CourseOption {
  id: string;
  course_name: string;
}

interface Props {
  courseOptions?: CourseOption[];
  onSuccess?: (task: Task) => void;
}

export function AddTaskForm({ courseOptions, onSuccess }: Props) {
  const router = useRouter();
  const { translate } = useLanguage();
  const onboarding = useOnboardingOptional();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [durationHours, setDurationHours] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const estimatedDuration = durationHours
      ? Math.round(parseFloat(durationHours) * 60)
      : null;

    startTransition(async () => {
      const result = await addTask({
        title,
        course_name: courseName,
        due_date: dueDate || null,
        estimated_duration: estimatedDuration,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setTitle("");
        setCourseName("");
        setDueDate("");
        setDurationHours("");
        if (result.task) {
          onSuccess?.(result.task as Task);
        }
        router.refresh();
        onboarding?.signalTourAction("task-saved");
      }
    });
  };

  return (
    <Card data-tour="add-task-form">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-primary" />
          {translate("addTaskTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">{translate("taskTitleLabel")} *</Label>
            <Input
              id="task-title"
              data-tour="task-name"
              placeholder={translate("taskTitlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-1.5" data-tour="task-course">
            <Label htmlFor="task-course">{translate("courseNameLabel")}</Label>
            {courseOptions ? (
              <Select
                id="task-course"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                disabled={isPending}
              >
                <option value="">{translate("otherNoCourse")}</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.course_name}>
                    {c.course_name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="task-course"
                placeholder={translate("courseNamePlaceholder")}
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                disabled={isPending}
              />
            )}
          </div>

          <div data-tour="task-deadline-save" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-due">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {translate("dueDateLabel")}
                  </span>
                </Label>
                <Input
                  id="task-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-duration">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {translate("estimatedDurationLabel")}
                  </span>
                </Label>
                <Input
                  id="task-duration"
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  placeholder={translate("durationPlaceholder")}
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" data-tour="task-save" disabled={isPending || !title.trim()}>
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{translate("savingLabel")}</>
              ) : (
                <><Plus className="h-4 w-4" />{translate("addTaskBtn")}</>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
