"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  Joyride,
  ACTIONS,
  EVENTS,
  STATUS,
  type EventData,
  type Step,
} from "react-joyride";
import {
  NAV_CLICK_PATH,
  ONBOARDING_TOUR_STEPS,
  TOUR_TARGET_Z_INDEX,
  TOUR_Z_INDEX,
  stepAllowsTargetInteraction,
  stepDisablesFocusTrap,
  stepDisablesOverlay,
} from "@/lib/onboarding-tour-steps";

interface Props {
  active: boolean;
  stepIndex: number;
  onStepIndexChange: (index: number) => void;
  onShowFinish: () => void;
  onSkip: () => void;
}

const TOUR_ACTIVE_ATTR = "data-tour-active";
const TOUR_OVERFLOW_FIX_ATTR = "data-tour-overflow-fix";

function pathMatches(pathname: string, prefix: string | undefined): boolean {
  if (!prefix) return true;
  if (prefix === "/") return pathname === "/";
  return pathname.startsWith(prefix);
}

function hasClippingOverflow(el: Element): boolean {
  const { overflow, overflowX, overflowY } = window.getComputedStyle(el);
  const clip = new Set(["hidden", "clip"]);
  return clip.has(overflow) || clip.has(overflowX) || clip.has(overflowY);
}

function elevateTourTarget(target: HTMLElement) {
  const pos = window.getComputedStyle(target).position;
  if (pos === "static") {
    target.dataset.tourPositionFix = "1";
    target.style.setProperty("position", "relative", "important");
  }
  target.style.setProperty("z-index", String(TOUR_TARGET_Z_INDEX), "important");
}

function resetTourTargetStyles(el: HTMLElement) {
  el.removeAttribute(TOUR_ACTIVE_ATTR);
  if (el.dataset.tourPositionFix) {
    el.style.removeProperty("position");
    delete el.dataset.tourPositionFix;
  }
  el.style.removeProperty("z-index");
}

/** Elevate the active target and unclip overflow:hidden ancestors */
function applyTourTargetElevation(target: HTMLElement | null) {
  document.querySelectorAll(`[${TOUR_ACTIVE_ATTR}]`).forEach((el) => {
    if (el !== target) resetTourTargetStyles(el as HTMLElement);
  });
  document.querySelectorAll(`[${TOUR_OVERFLOW_FIX_ATTR}]`).forEach((el) => {
    el.removeAttribute(TOUR_OVERFLOW_FIX_ATTR);
  });

  if (!target) return;

  target.setAttribute(TOUR_ACTIVE_ATTR, "");
  elevateTourTarget(target);

  let parent = target.parentElement;
  while (parent && parent !== document.body) {
    if (hasClippingOverflow(parent)) {
      parent.setAttribute(TOUR_OVERFLOW_FIX_ATTR, "");
    }
    parent = parent.parentElement;
  }
}

function clearTourTargetElevation() {
  document.querySelectorAll(`[${TOUR_ACTIVE_ATTR}]`).forEach((el) => {
    resetTourTargetStyles(el as HTMLElement);
  });
  document.querySelectorAll(`[${TOUR_OVERFLOW_FIX_ATTR}]`).forEach((el) => {
    el.removeAttribute(TOUR_OVERFLOW_FIX_ATTR);
  });
}

export function OnboardingTour({
  active,
  stepIndex,
  onStepIndexChange,
  onShowFinish,
  onSkip,
}: Props) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const [targetReady, setTargetReady] = useState(false);
  const [joyrideRun, setJoyrideRun] = useState(false);

  const currentStep = ONBOARDING_TOUR_STEPS[stepIndex];

  const steps: Step[] = useMemo(
    () =>
      ONBOARDING_TOUR_STEPS.map((s) => {
        const allowInteraction = stepAllowsTargetInteraction(s);
        const noOverlay = stepDisablesOverlay(s);
        return {
          target: `[data-tour="${s.target}"]`,
          content: s.content,
          placement: s.placement ?? "auto",
          skipBeacon: true,
          buttons: s.advanceOn === "manual" ? ["primary", "skip"] : ["skip"],
          /** v3: false = clicks reach the spotlight target */
          blockTargetInteraction: !allowInteraction,
          hideOverlay: noOverlay,
          disableFocusTrap: stepDisablesFocusTrap(s),
          overlayClickAction: false,
          dismissKeyAction: false,
          spotlightPadding: allowInteraction ? 8 : 6,
        };
      }),
    [],
  );

  const checkTarget = useCallback(() => {
    if (!currentStep) {
      setTargetReady(false);
      return;
    }
    if (!pathMatches(pathname, currentStep.pathPrefix)) {
      setTargetReady(false);
      return;
    }
    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    setTargetReady(!!el);
  }, [currentStep, pathname]);

  useLayoutEffect(() => {
    if (!active) {
      setJoyrideRun(false);
      setTargetReady(false);
      clearTourTargetElevation();
      return;
    }
    checkTarget();
    const id = window.setInterval(checkTarget, 250);
    return () => window.clearInterval(id);
  }, [active, checkTarget, stepIndex, pathname]);

  useLayoutEffect(() => {
    if (!active || !currentStep || !joyrideRun || !targetReady) {
      clearTourTargetElevation();
      return;
    }

    const selector = `[data-tour="${currentStep.target}"]`;
    const target = document.querySelector(selector) as HTMLElement | null;
    applyTourTargetElevation(target);

    const observer = new MutationObserver(() => {
      const next = document.querySelector(selector) as HTMLElement | null;
      applyTourTargetElevation(next);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour", "hidden", "class", "style"],
    });

    return () => {
      observer.disconnect();
      clearTourTargetElevation();
    };
  }, [active, currentStep, joyrideRun, targetReady, stepIndex]);

  useEffect(() => {
    if (!active || !currentStep) return;
    if (pathMatches(pathname, currentStep.pathPrefix) && targetReady) {
      const t = window.setTimeout(() => setJoyrideRun(true), 120);
      return () => window.clearTimeout(t);
    }
    setJoyrideRun(false);
  }, [active, currentStep, pathname, targetReady, stepIndex]);

  useEffect(() => {
    if (!active || !currentStep || currentStep.advanceOn !== "nav-click") return;
    const expected = NAV_CLICK_PATH[currentStep.target];
    if (!expected) return;

    const matches =
      expected === "/" ? pathname === "/" : pathname.startsWith(expected);

    if (matches) {
      const t = window.setTimeout(() => onStepIndexChange(stepIndex + 1), 500);
      return () => window.clearTimeout(t);
    }
  }, [active, currentStep, pathname, stepIndex, onStepIndexChange]);

  useEffect(() => {
    if (!active || !currentStep || currentStep.advanceOn !== "nav-click") {
      prevPathRef.current = pathname;
      return;
    }
    const expected = NAV_CLICK_PATH[currentStep.target];
    if (!expected) return;

    const matches =
      expected === "/" ? pathname === "/" : pathname.startsWith(expected);

    if (matches && prevPathRef.current !== pathname) {
      const t = window.setTimeout(
        () => onStepIndexChange(stepIndex + 1),
        400,
      );
      prevPathRef.current = pathname;
      return () => window.clearTimeout(t);
    }
    prevPathRef.current = pathname;
  }, [active, currentStep, pathname, stepIndex, onStepIndexChange]);

  const handleEvent = useCallback(
    (data: EventData) => {
      const { action, index, status, type } = data;

      if (status === STATUS.SKIPPED || action === ACTIONS.SKIP) {
        onSkip();
        return;
      }

      if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT) {
        const step = ONBOARDING_TOUR_STEPS[index];
        if (step?.advanceOn !== "manual") return;

        if (index >= ONBOARDING_TOUR_STEPS.length - 1) {
          setJoyrideRun(false);
          onShowFinish();
        } else {
          onStepIndexChange(index + 1);
        }
      }
    },
    [onShowFinish, onSkip, onStepIndexChange],
  );

  if (!active || stepIndex >= ONBOARDING_TOUR_STEPS.length) return null;

  return (
    <Joyride
      steps={steps}
      stepIndex={stepIndex}
      run={joyrideRun}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: "חזרה",
        close: "סגור",
        last: "סיום",
        next: "הבא",
        skip: "דלג על הסיור",
        nextWithProgress: "הבא ({current} מתוך {total})",
      }}
      options={{
        primaryColor: "hsl(var(--primary))",
        textColor: "hsl(var(--foreground))",
        backgroundColor: "hsl(var(--card))",
        overlayColor: "rgba(0, 0, 0, 0.55)",
        zIndex: TOUR_Z_INDEX,
        showProgress: true,
        disableFocusTrap: true,
        blockTargetInteraction: false,
      }}
      styles={{
        overlay: {
          pointerEvents: "none",
        },
        spotlight: {
          pointerEvents: "none",
        },
        tooltip: {
          borderRadius: 12,
          zIndex: TOUR_Z_INDEX + 2,
          pointerEvents: "auto",
        },
        tooltipContent: {
          textAlign: "right",
          lineHeight: 1.6,
          fontSize: 14,
        },
        floater: {
          zIndex: TOUR_Z_INDEX + 2,
          pointerEvents: "auto",
        },
      }}
    />
  );
}
