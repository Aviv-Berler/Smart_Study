import { AppShell } from "@/components/layout/app-shell";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { OnboardingProvider } from "@/components/providers/onboarding-provider";
import { PlannerScheduleProvider } from "@/components/providers/planner-schedule-provider";
import { UserProvider } from "@/components/providers/user-provider";
import { getProfile } from "@/app/actions/profile";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  return (
    <SidebarProvider>
      <UserProvider initialProfile={profile}>
        <OnboardingProvider>
          <PlannerScheduleProvider>
            <AppShell>{children}</AppShell>
          </PlannerScheduleProvider>
        </OnboardingProvider>
      </UserProvider>
    </SidebarProvider>
  );
}
