import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { OnboardingProvider } from "@/components/providers/onboarding-provider";
import { PlannerScheduleProvider } from "@/components/providers/planner-schedule-provider";
import { UserProvider } from "@/components/providers/user-provider";
import { getProfile } from "@/app/actions/profile";

function AppLayoutFallback({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider initialProfile={null}>
      <OnboardingProvider>
        <PlannerScheduleProvider>
          <AppShell>{children}</AppShell>
        </PlannerScheduleProvider>
      </OnboardingProvider>
    </UserProvider>
  );
}

async function AppLayoutWithProfile({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();

  return (
    <UserProvider initialProfile={profile}>
      <OnboardingProvider>
        <PlannerScheduleProvider>
          <AppShell>{children}</AppShell>
        </PlannerScheduleProvider>
      </OnboardingProvider>
    </UserProvider>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppLayoutFallback>{children}</AppLayoutFallback>}>
        <AppLayoutWithProfile>{children}</AppLayoutWithProfile>
      </Suspense>
    </SidebarProvider>
  );
}
