"use client";

import { Flag } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import {
  AutoDirText,
  LtrIsolate,
  PercentValue,
} from "@/components/ui/bidi-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface MilestoneItem {
  id: string;
  title: string;
  courseName: string;
  dueInDays: number;
  progressPercent: number;
}

interface Props {
  milestones: MilestoneItem[];
}

function MilestoneCard({ milestone }: { milestone: MilestoneItem }) {
  const { translate } = useLanguage();
  const urgentCount = milestone.dueInDays;
  const urgentText =
    urgentCount === 0
      ? "Today!"
      : urgentCount === 1
        ? translate("dayLeft")
        : translate("daysLeft");

  return (
    <Card className="min-w-[240px] shrink-0 border-border shadow-sm">
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-0.5">
            {milestone.courseName && (
              <AutoDirText className="truncate text-xs text-muted-foreground">
                {milestone.courseName}
              </AutoDirText>
            )}
            <AutoDirText className="truncate text-sm font-semibold">
              {milestone.title}
            </AutoDirText>
          </div>
          <Badge
            className={`shrink-0 flex flex-row items-center gap-1 ${
              milestone.dueInDays <= 3
                ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                : "bg-primary/10 text-primary hover:bg-primary/10"
            }`}
          >
            {urgentCount > 1 ? (
              <>
                <LtrIsolate>{urgentCount}</LtrIsolate>
                <span>{urgentText}</span>
              </>
            ) : (
              <span>{urgentCount === 0 ? urgentText : `1 ${urgentText}`}</span>
            )}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{translate("prepProgress")}</span>
            <PercentValue
              value={milestone.progressPercent}
              className="font-medium text-primary"
            />
          </div>
          <Progress value={milestone.progressPercent} className="h-1.5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MilestonesSection({ milestones }: Props) {
  const { translate } = useLanguage();

  if (milestones.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {translate("upcomingMilestones")}
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {milestones.map((m) => (
          <MilestoneCard key={m.id} milestone={m} />
        ))}
      </div>
    </section>
  );
}
