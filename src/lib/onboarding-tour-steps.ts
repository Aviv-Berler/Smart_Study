export type TourAdvanceOn =
  | "nav-click"
  | "wait-preferences-saved"
  | "wait-course-saved"
  | "wait-task-saved"
  | "wait-ai-generated"
  | "wait-block-dragged"
  | "manual";

export type TourAction =
  | "preferences-saved"
  | "course-saved"
  | "task-saved"
  | "ai-generated"
  | "block-dragged";

export interface TourStepConfig {
  /** data-tour attribute value */
  target: string;
  content: string;
  advanceOn: TourAdvanceOn;
  /** Step only shows when pathname matches (prefix) */
  pathPrefix?: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto" | "center";
  /**
   * Allow pointer events on the highlighted target (Joyride v3: blockTargetInteraction=false).
   * Required for typing, clicking buttons, nav links, drag, etc.
   */
  spotlightClicks?: boolean;
  /**
   * Remove the dimmed backdrop so native dropdowns / DnD are not clipped (Joyride v3: hideOverlay=true).
   */
  disableOverlay?: boolean;
}

/** Info-only steps — user advances via tour "Next", page need not be clickable */
const READ_ONLY_TARGETS = new Set([
  "daily-goals-row",
  "daily-task-board",
  "daily-schedule-panel",
]);

/** Steps where the full-page backdrop must be hidden (nav, DnD, AI prompt typing) */
const NO_OVERLAY_TARGETS = new Set([
  "settings",
  "input",
  "planner",
  "dashboard",
  "learning-preferences",
  "ai-prompt-area",
  "schedule-block-sample",
]);

export function stepAllowsTargetInteraction(step: TourStepConfig): boolean {
  if (step.spotlightClicks !== undefined) return step.spotlightClicks;
  if (step.advanceOn === "manual" && READ_ONLY_TARGETS.has(step.target)) {
    return false;
  }
  return true;
}

export function stepDisablesOverlay(step: TourStepConfig): boolean {
  if (step.disableOverlay !== undefined) return step.disableOverlay;
  return NO_OVERLAY_TARGETS.has(step.target);
}

export function stepDisablesFocusTrap(_step: TourStepConfig): boolean {
  return true;
}

export const ONBOARDING_TOUR_STEPS: TourStepConfig[] = [
  {
    target: "settings",
    content: "בוא נתחיל בלהכיר אותך. לחץ כאן כדי להיכנס להגדרות.",
    advanceOn: "nav-click",
    placement: "left",
    spotlightClicks: true,
  },
  {
    target: "learning-preferences",
    content: "כאן תגדיר את שעות הלמידה וההעדפות שלך. מלא את הפרטים ושמור כדי להמשיך.",
    advanceOn: "wait-preferences-saved",
    pathPrefix: "/settings",
    placement: "bottom",
    spotlightClicks: true,
    disableOverlay: true,
  },
  {
    target: "input",
    content: "עכשיו, בוא נכניס את הקורס הראשון שלך.",
    advanceOn: "nav-click",
    placement: "left",
    spotlightClicks: true,
  },
  {
    target: "add-course-form",
    content:
      "כאן מקימים קורס חדש. הכנס שם, בחר סוג, והגדר שעות. שים לב לכפתור הוספת בלוק זמן למפגשים נוספים. בסיום לחץ שמירה.",
    advanceOn: "wait-course-saved",
    pathPrefix: "/manage",
    placement: "bottom",
    spotlightClicks: true,
    disableOverlay: false,
  },
  {
    target: "add-task-form",
    content:
      "כאן מזינים מטלה חדשה. תן לה שם, שייך אותה לקורס שיצרת, קבע תאריך יעד ולחץ על שמירה.",
    advanceOn: "wait-task-saved",
    pathPrefix: "/manage",
    placement: "bottom",
    spotlightClicks: true,
    disableOverlay: false,
  },
  {
    target: "planner",
    content: "הגיע הזמן לקסם. בוא נייצר לך לו״ז.",
    advanceOn: "nav-click",
    placement: "left",
    spotlightClicks: true,
  },
  {
    target: "ai-prompt-area",
    content:
      "ספר לי על האילוצים שלך לשבוע הקרוב. תהיה מפורט! (למשל: 'בשלישי אני עובד מ-14:00 עד 20:00'). לאחר מכן לחץ על צור לו״ז.",
    advanceOn: "wait-ai-generated",
    pathPrefix: "/planner",
    placement: "bottom",
    spotlightClicks: true,
    disableOverlay: true,
  },
  {
    target: "daily-goals-row",
    content:
      "שים לב לפס ההתקדמות כאן. זה הצפי שלך! אם תעמוד בלוח הזמנים שנוצר, לכאן תגיע בסוף השבוע.",
    advanceOn: "manual",
    pathPrefix: "/planner",
    placement: "top",
    spotlightClicks: false,
  },
  {
    target: "schedule-block-sample",
    content: "הכל גמיש. אתה יכול לגרור ולהזיז כל בלוק לאן שנוח לך. נסה לגרור אותו עכשיו!",
    advanceOn: "wait-block-dragged",
    pathPrefix: "/planner",
    placement: "right",
    spotlightClicks: true,
    disableOverlay: true,
  },
  {
    target: "dashboard",
    content: "בוא נראה איך זה נראה בלוח הבקרה.",
    advanceOn: "nav-click",
    placement: "left",
    spotlightClicks: true,
  },
  {
    target: "daily-task-board",
    content: "כאן תראה את המטרות שנגזרו לך להיום מתוך המשימה הגדולה.",
    advanceOn: "manual",
    pathPrefix: "/",
    placement: "bottom",
    spotlightClicks: false,
  },
  {
    target: "daily-schedule-panel",
    content:
      "וכאן תראה את הלו״ז המדויק להיום, שמשלב את מערכת השעות שלך יחד עם זמן הלמידה העצמי.",
    advanceOn: "manual",
    pathPrefix: "/",
    placement: "top",
    spotlightClicks: false,
  },
];

export const TOUR_ACTION_FOR_STEP: Partial<Record<TourAdvanceOn, TourAction>> = {
  "wait-preferences-saved": "preferences-saved",
  "wait-course-saved":      "course-saved",
  "wait-task-saved":        "task-saved",
  "wait-ai-generated":      "ai-generated",
  "wait-block-dragged":     "block-dragged",
};

export const NAV_CLICK_PATH: Partial<Record<string, string>> = {
  settings:  "/settings",
  input:     "/manage",
  planner:   "/planner",
  dashboard: "/",
};

/** Joyride portal + tooltip stacking — above app chrome, below native OS menus */
export const TOUR_Z_INDEX = 11000;

/** Active tour target must pierce above the Joyride overlay cutout */
export const TOUR_TARGET_Z_INDEX = 100_000;
