"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLanguage } from "@/components/providers/language-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LtrIsolate } from "@/components/ui/bidi-text";
import type { TranslationKey } from "@/lib/i18n";
import type { CourseVarianceInsight } from "@/types/database";

export interface CourseChartDatum {
  courseName: string;
  variancePct: number;
  averageVariance: number;
  taskCount: number;
}

function varianceBarColor(variance: number): string {
  const pct = variance * 100;
  if (pct > 10) return "hsl(38 92% 50%)";
  if (pct < -10) return "hsl(217 91% 60%)";
  return "hsl(142 71% 45%)";
}

function toChartData(courses: CourseVarianceInsight[]): CourseChartDatum[] {
  return courses.map((c) => ({
    courseName: c.courseName,
    variancePct: Math.round(c.averageVariance * 1000) / 10,
    averageVariance: c.averageVariance,
    taskCount: c.taskCount,
  }));
}

function CustomTooltip({
  active,
  payload,
  translate,
}: {
  active?: boolean;
  payload?: Array<{ payload: CourseChartDatum }>;
  translate: (key: TranslationKey) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{row.courseName}</p>
      <p className="text-muted-foreground">
        {translate("insightsChartVariance")}{" "}
        <LtrIsolate>
          {row.variancePct > 0 ? "+" : ""}
          {row.variancePct}%
        </LtrIsolate>
      </p>
      <p className="text-muted-foreground">
        {translate("insightsChartTaskCount").replace("{count}", String(row.taskCount))}
      </p>
    </div>
  );
}

export function CourseVarianceChart({ courses }: { courses: CourseVarianceInsight[] }) {
  const { translate } = useLanguage();
  const data = toChartData(courses);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">{translate("insightsChartTitle")}</CardTitle>
        <CardDescription>{translate("insightsChartDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            {translate("insightsChartEmpty")}
          </div>
        ) : (
          <div className="h-64 w-full sm:h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis
                  dataKey="courseName"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={44}
                />
                <Tooltip
                  content={<CustomTooltip translate={translate} />}
                  cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                />
                <Bar dataKey="variancePct" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {data.map((entry) => (
                    <Cell key={entry.courseName} fill={varianceBarColor(entry.averageVariance)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {data.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              {translate("insightsLegendAccurate")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              {translate("insightsLegendOver")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
              {translate("insightsLegendUnder")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
