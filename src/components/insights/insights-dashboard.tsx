"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Loader2, Target, TrendingUp } from "lucide-react";
import { getInsights } from "@/app/actions/insights";
import { CourseVarianceChart } from "@/components/insights/course-variance-chart";
import { InsightRecommendations } from "@/components/insights/insight-recommendations";
import { useLanguage } from "@/components/providers/language-provider";
import { LtrIsolate } from "@/components/ui/bidi-text";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { WeeklyInsights } from "@/types/database";

const DAY_OPTIONS = [
  { value: 7 as const, labelKey: "insightsLast7Days" as TranslationKey },
  { value: 30 as const, labelKey: "insightsLast30Days" as TranslationKey },
];

type DayOption = (typeof DAY_OPTIONS)[number]["value"];

function parseDaysParam(raw: string | null): DayOption {
  return raw === "30" ? 30 : 7;
}

function formatExecutionRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

interface InsightsDashboardProps {
  initialInsights: WeeklyInsights;
  initialDays: DayOption;
}

export function InsightsDashboard({
  initialInsights,
  initialDays,
}: InsightsDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { translate } = useLanguage();
  const daysFromUrl = parseDaysParam(searchParams.get("days"));
  const [days, setDays] = useState<DayOption>(initialDays);
  const [insights, setInsights] = useState<WeeklyInsights>(initialInsights);
  const [isPending, startTransition] = useTransition();

  const insightsBasePath = pathname.startsWith("/insights/preview")
    ? "/insights/preview"
    : "/insights";

  const loadInsights = useCallback((nextDays: DayOption) => {
    startTransition(async () => {
      const data = await getInsights(nextDays);
      setInsights(data);
    });
  }, []);

  useEffect(() => {
    if (daysFromUrl === days) return;
    setDays(daysFromUrl);
    loadInsights(daysFromUrl);
  }, [daysFromUrl, days, loadInsights]);

  const handleDaysChange = (nextDays: DayOption) => {
    if (nextDays === days) return;
    setDays(nextDays);
    router.replace(`${insightsBasePath}?days=${nextDays}`, { scroll: false });
    loadInsights(nextDays);
  };

  const loading = isPending;
  const { highControlCount, lowControlCount, activeTaskCount } = insights.taskControlScore;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BarChart3 className="h-5 w-5 text-primary" />
          <p className="text-xs sm:text-sm">
            {translate("insightsPeriodLabel")}{" "}
            <LtrIsolate>
              {insights.periodStart} — {insights.periodEnd}
            </LtrIsolate>
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
          role="tablist"
          aria-label={translate("insightsTimeFilterAria")}
        >
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={days === opt.value}
              disabled={loading}
              onClick={() => handleDaysChange(opt.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:text-sm",
                days === opt.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {translate(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Target className="h-4 w-4 text-primary" />
                {translate("insightsDailyGoalsKpi")}
              </div>
              <div>
                <p className="text-4xl font-bold tracking-tight sm:text-5xl">
                  <LtrIsolate>{formatExecutionRate(insights.overallExecutionRate)}</LtrIsolate>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {translate("insightsDailyGoalsKpiDesc")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent">
            <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                {translate("insightsTaskControlKpi")}
              </div>
              <div>
                <p className="text-2xl font-bold leading-tight text-emerald-800 dark:text-emerald-200 sm:text-3xl">
                  {translate("insightsHighControlCount").replace(
                    "{count}",
                    String(highControlCount),
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lowControlCount > 0
                    ? translate("insightsLowControlSummary")
                        .replace("{low}", String(lowControlCount))
                        .replace("{active}", String(activeTaskCount))
                    : translate("insightsActiveSummary").replace(
                        "{active}",
                        String(activeTaskCount),
                      )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CourseVarianceChart courses={insights.courseVariances} />

      <InsightRecommendations insights={insights} />
    </div>
  );
}
