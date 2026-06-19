"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock, Sparkles, Zap } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import {
  AutoDirText,
  LtrIsolate,
} from "@/components/ui/bidi-text";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatMinutes } from "@/lib/utils";
import type { TodaySlot } from "@/types/database";

const TYPE_VARIANT = {
  lecture:  "default" as const,
  tutorial: "secondary" as const,
  other:    "muted" as const,
  study:    "default" as const,
};

interface Props {
  slots: TodaySlot[];
}

function isSlotActive(slot: TodaySlot, nowMinutes: number): boolean {
  const [h, m] = slot.startTime.split(":").map(Number);
  const start = h * 60 + m;
  return nowMinutes >= start && nowMinutes < start + slot.duration;
}

function isSlotPast(slot: TodaySlot, nowMinutes: number): boolean {
  const [h, m] = slot.startTime.split(":").map(Number);
  const end = h * 60 + m + slot.duration;
  return nowMinutes >= end;
}

function SlotCard({
  slot,
  nowMinutes,
}: {
  slot: TodaySlot;
  nowMinutes: number;
}) {
  const { translate } = useLanguage();
  const active = isSlotActive(slot, nowMinutes);
  const past = isSlotPast(slot, nowMinutes);
  const isStudy = slot.kind === "study" || slot.type === "study";

  const [startH, startM] = slot.startTime.split(":").map(Number);
  const endMin = startH * 60 + startM + slot.duration;
  const endH = String(Math.floor(endMin / 60)).padStart(2, "0");
  const endMStr = String(endMin % 60).padStart(2, "0");
  const endTime = `${endH}:${endMStr}`;

  return (
    <Card
      className={cn(
        "transition-all",
        active
          ? isStudy
            ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/30"
            : "border-primary bg-primary/5 shadow-md ring-1 ring-primary/30"
          : past
            ? "border-border bg-muted/20"
            : isStudy
              ? "border-primary/25 hover:shadow-sm"
              : "border-border hover:shadow-sm"
      )}
    >
      <CardContent className="flex items-center gap-3 p-3">
        {/* Time column */}
        <div className="shrink-0 min-w-[3.5rem] text-center">
          <LtrIsolate>
            <p
              className={cn(
                "text-base font-bold tabular-nums",
                active ? "text-primary" : "text-foreground"
              )}
            >
              {slot.startTime}
            </p>
            <p className="text-[11px] text-muted-foreground">{endTime}</p>
          </LtrIsolate>
        </div>

        {/* Divider */}
        <div
          className={cn(
            "h-8 w-0.5 shrink-0 rounded-full",
            active ? "bg-primary" : past ? "bg-muted-foreground/30" : "bg-border"
          )}
        />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <AutoDirText
              className={cn(
                "text-sm font-semibold truncate",
                active ? "text-primary" : "text-foreground"
              )}
            >
              {isStudy ? (slot.title ?? slot.courseName) : slot.courseName}
            </AutoDirText>
            <Badge
              variant={TYPE_VARIANT[slot.type]}
              className={cn("text-[10px] shrink-0", isStudy && "bg-primary/15 text-primary border-primary/30")}
            >
              {isStudy ? (
                <span className="flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  Study
                </span>
              ) : (
                slot.type
              )}
            </Badge>
            {active && (
              <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shrink-0">
                <Zap className="h-3 w-3" />
                {translate("focusNow")}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-row items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <LtrIsolate>{formatMinutes(slot.duration)}</LtrIsolate>
            {isStudy && slot.courseName && slot.title && (
              <AutoDirText className="ms-1 truncate text-[10px]">{slot.courseName}</AutoDirText>
            )}
            {past && (
              <span className="ms-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {translate("doneLabel")}
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SchedulePanel({ slots }: Props) {
  const { translate } = useLanguage();
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const totalMinutes = slots.reduce((sum, s) => sum + s.duration, 0);

  return (
    <section className="space-y-3" data-tour="daily-schedule-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{translate("schedule")}</h2>
        </div>
        {totalMinutes > 0 && (
          <span className="flex flex-row items-center gap-1 text-sm font-medium text-muted-foreground">
            <LtrIsolate>{formatMinutes(totalMinutes)}</LtrIsolate>
            <span>{translate("totalScheduled")}</span>
          </span>
        )}
      </div>

      {slots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {translate("noScheduleToday")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => (
            <SlotCard key={slot.id} slot={slot} nowMinutes={nowMinutes} />
          ))}
        </div>
      )}
    </section>
  );
}
