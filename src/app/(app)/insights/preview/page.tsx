import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { InsightsDashboard } from "@/components/insights/insights-dashboard";
import { getInsights } from "@/app/actions/insights";
import { Loader2 } from "lucide-react";

function InsightsFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/** Internal preview — full dashboard (dark-launch hidden route). */
export default async function InsightsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = params.days === "30" ? 30 : 7;
  const initialInsights = await getInsights(days);

  return (
    <>
      <AppHeader titleKey="insightsTitle" subtitleKey="insightsDesc" />
      <Suspense fallback={<InsightsFallback />}>
        <InsightsDashboard initialInsights={initialInsights} initialDays={days} />
      </Suspense>
    </>
  );
}
