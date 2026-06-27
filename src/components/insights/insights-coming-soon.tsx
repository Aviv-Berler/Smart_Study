"use client";

import { BarChart3, Lock, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Card, CardContent } from "@/components/ui/card";

export function InsightsComingSoon() {
  const { translate } = useLanguage();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl items-center justify-center p-4 sm:p-6">
      <Card className="w-full overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 via-card to-violet-500/5 shadow-md">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-12 text-center sm:px-10 sm:py-14">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-inner">
              <BarChart3 className="h-9 w-9 text-primary" strokeWidth={1.75} />
            </div>
            <span className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-muted shadow-sm">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <Sparkles
              className="absolute -start-2 -top-2 h-5 w-5 text-amber-500/80 animate-pulse"
              aria-hidden
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {translate("insightsComingSoonTitle")}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              {translate("insightsComingSoonBody")}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {translate("insightsEngineCollecting")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
