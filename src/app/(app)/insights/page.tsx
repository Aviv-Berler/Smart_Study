import { AppHeader } from "@/components/layout/app-header";
import { InsightsComingSoon } from "@/components/insights/insights-coming-soon";

export default function InsightsPage() {
  return (
    <>
      <AppHeader titleKey="insightsTitle" subtitleKey="insightsDesc" />
      <InsightsComingSoon />
    </>
  );
}
