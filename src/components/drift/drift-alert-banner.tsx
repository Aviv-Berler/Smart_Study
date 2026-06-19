"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateSchedulePlan } from "@/app/actions/planner";
import type { DriftState } from "@/app/actions/planner";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { isolateLtr } from "@/lib/bidi";

const HIDE_SESSION_KEY = "smart-study-drift-alert-hidden";

interface DriftAlertBannerProps {
  drift: DriftState;
}

export function DriftAlertBanner({ drift }: DriftAlertBannerProps) {
  const { translate } = useLanguage();
  const router = useRouter();
  const [hideAlert, setHideAlert] = useState(false);
  const [autoFixing, startAutoFix] = useTransition();

  useEffect(() => {
    if (!drift.hasDrift) {
      try {
        sessionStorage.removeItem(HIDE_SESSION_KEY);
      } catch {
        // ignore
      }
      setHideAlert(false);
      return;
    }
    try {
      setHideAlert(sessionStorage.getItem(HIDE_SESSION_KEY) === "1");
    } catch {
      setHideAlert(false);
    }
  }, [drift.hasDrift]);

  if (!drift.hasDrift || hideAlert) return null;

  const handleAutoFix = () => {
    startAutoFix(async () => {
      try {
        const result = await generateSchedulePlan("", { resolveMissedDrift: true });
        if (!result.success) {
          toast.error(result.error ?? translate("driftAutoFixFailed"));
          return;
        }
        if (result.status === "conflict") {
          toast.warning(translate("conflictWarning"));
          router.push("/planner");
          router.refresh();
          return;
        }
        const count = result.block_count ?? 0;
        toast.success(
          `${isolateLtr(count)} ${count !== 1 ? translate("blocksScheduled") : translate("blockScheduled")}`,
        );
        router.push("/planner");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : translate("driftAutoFixFailed"));
      }
    });
  };

  return (
    <div
      className="sticky top-14 z-10 border-b border-red-500/25 bg-red-50/90 px-4 py-3 backdrop-blur-sm dark:bg-red-950/30 sm:px-6"
      role="alert"
      dir="auto"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm leading-relaxed text-red-900 dark:text-red-100">
            {translate("driftAlertMessage")}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button
            size="sm"
            onClick={handleAutoFix}
            disabled={autoFixing}
            className="gap-1.5"
          >
            {autoFixing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {autoFixing ? translate("driftAutoFixing") : translate("driftAutoFix")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              try {
                sessionStorage.setItem(HIDE_SESSION_KEY, "1");
              } catch {
                // ignore
              }
              setHideAlert(true);
            }}
            disabled={autoFixing}
            className="border-red-500/30 bg-background/80 hover:bg-background"
          >
            {translate("driftManualFix")}
          </Button>
        </div>
      </div>
    </div>
  );
}
