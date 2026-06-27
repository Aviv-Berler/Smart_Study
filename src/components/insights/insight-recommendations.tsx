"use client";

import Link from "next/link";
import { AlertTriangle, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { WeeklyInsights } from "@/types/database";

interface InsightCardModel {
  id: string;
  icon: typeof Lightbulb;
  tone: "amber" | "violet" | "emerald";
  title: string;
  body: string;
  action?: { label: string; href: string };
}

function buildRecommendations(
  insights: WeeklyInsights,
  translate: (key: TranslationKey) => string,
): InsightCardModel[] {
  const cards: InsightCardModel[] = [];

  const overrunCourses = insights.courseVariances.filter(
    (c) => c.averageVariance > 0.15,
  );
  for (const course of overrunCourses.slice(0, 2)) {
    cards.push({
      id: `variance-${course.courseName}`,
      icon: TrendingUp,
      tone: "amber",
      title: translate("insightsVarianceTitle"),
      body: translate("insightsVarianceBody").replace("{course}", course.courseName),
      action: { label: translate("insightsUpdatePrefs"), href: "/settings" },
    });
  }

  if (insights.taskControlScore.lowControlCount > 0) {
    cards.push({
      id: "low-control",
      icon: AlertTriangle,
      tone: "violet",
      title: translate("insightsLowControlTitle"),
      body: translate("insightsLowControlBody"),
      action: { label: translate("insightsReplan"), href: "/planner" },
    });
  }

  if (
    insights.overallExecutionRate != null &&
    insights.overallExecutionRate >= 0.75 &&
    cards.length < 3
  ) {
    cards.push({
      id: "strong-execution",
      icon: Sparkles,
      tone: "emerald",
      title: translate("insightsStrongExecTitle"),
      body: translate("insightsStrongExecBody"),
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: "keep-going",
      icon: Lightbulb,
      tone: "emerald",
      title: translate("insightsKeepGoingTitle"),
      body: translate("insightsKeepGoingBody"),
      action: { label: translate("insightsGoToDashboard"), href: "/" },
    });
  }

  return cards.slice(0, 3);
}

const toneStyles = {
  amber: {
    wrap: "border-amber-500/25 bg-amber-500/5",
    icon: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/15",
  },
  violet: {
    wrap: "border-violet-500/25 bg-violet-500/5",
    icon: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-500/15",
  },
  emerald: {
    wrap: "border-emerald-500/25 bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/15",
  },
} as const;

export function InsightRecommendations({ insights }: { insights: WeeklyInsights }) {
  const { translate } = useLanguage();
  const cards = buildRecommendations(insights, translate);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold sm:text-lg">
        {translate("insightsRecommendationsHeading")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const styles = toneStyles[card.tone];
          const Icon = card.icon;
          return (
            <Card
              key={card.id}
              className={cn("overflow-hidden border shadow-sm", styles.wrap)}
            >
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      styles.iconBg,
                    )}
                  >
                    <Icon className={cn("h-4 w-4", styles.icon)} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold leading-snug">{card.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{card.body}</p>
                  </div>
                </div>
                {card.action && (
                  <Button asChild variant="outline" size="sm" className="mt-auto w-full sm:w-auto">
                    <Link href={card.action.href}>{card.action.label}</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
