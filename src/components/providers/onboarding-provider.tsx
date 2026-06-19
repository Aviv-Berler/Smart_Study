"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { GuideModal } from "@/components/onboarding/GuideModal";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { TourFinishModal } from "@/components/onboarding/TourFinishModal";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useUser } from "@/components/providers/user-provider";
import type { TourAction } from "@/lib/onboarding-tour-steps";
import {
  NAV_CLICK_PATH,
  ONBOARDING_TOUR_STEPS,
  TOUR_ACTION_FOR_STEP,
} from "@/lib/onboarding-tour-steps";

function onboardingStorageKey(userId: string): string {
  return `smart-study-onboarding-complete_${userId}`;
}

interface OnboardingContextValue {
  openGuide: () => void;
  tourActive: boolean;
  tourStepIndex: number;
  signalTourAction: (action: TourAction) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useUser();
  const userId = profile?.id;

  const [guideOpen, setGuideOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const { collapsed, setCollapsed } = useSidebar();

  useEffect(() => {
    if (!userId) return;

    try {
      const done = localStorage.getItem(onboardingStorageKey(userId));
      if (!done) {
        const timer = window.setTimeout(() => setTourActive(true), 800);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable — skip auto-tour
    }
  }, [userId]);

  useEffect(() => {
    if (tourActive && collapsed) {
      setCollapsed(false);
    }
  }, [tourActive, collapsed, setCollapsed]);

  const markComplete = useCallback(() => {
    if (!userId) {
      setTourActive(false);
      setShowFinishModal(false);
      return;
    }
    try {
      localStorage.setItem(onboardingStorageKey(userId), "1");
    } catch {
      // ignore
    }
    setTourActive(false);
    setShowFinishModal(false);
    setTourStepIndex(0);
  }, [userId]);

  const signalTourAction = useCallback(
    (action: TourAction) => {
      if (!tourActive || showFinishModal) return;
      const step = ONBOARDING_TOUR_STEPS[tourStepIndex];
      if (!step) return;
      const expected = TOUR_ACTION_FOR_STEP[step.advanceOn];
      if (expected === action) {
        window.setTimeout(() => setTourStepIndex((i) => i + 1), 400);
      }
    },
    [tourActive, showFinishModal, tourStepIndex],
  );

  const openGuide = useCallback(() => setGuideOpen(true), []);

  const value = useMemo(
    () => ({
      openGuide,
      tourActive,
      tourStepIndex,
      signalTourAction,
    }),
    [openGuide, tourActive, tourStepIndex, signalTourAction],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <GuideModal open={guideOpen} onOpenChange={setGuideOpen} />
      <OnboardingTour
        active={tourActive && !showFinishModal}
        stepIndex={tourStepIndex}
        onStepIndexChange={setTourStepIndex}
        onShowFinish={() => setShowFinishModal(true)}
        onSkip={markComplete}
      />
      <TourFinishModal open={showFinishModal} onFinish={markComplete} />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}

/** Safe no-op when tour is inactive */
export function useOnboardingOptional() {
  return useContext(OnboardingContext);
}

export { NAV_CLICK_PATH };
