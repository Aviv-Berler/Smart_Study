import {
  BarChart3,
  CalendarRange,
  ClipboardPen,
  Home,
  Settings,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", icon: Home, labelKey: "dashboard" as const, tourId: "dashboard" },
  { href: "/planner", icon: CalendarRange, labelKey: "futurePlanner" as const, tourId: "planner" },
  { href: "/manage", icon: ClipboardPen, labelKey: "manageTitle" as const, tourId: "input" },
  { href: "/insights", icon: BarChart3, labelKey: "insightsTitle" as const, tourId: "insights" },
  { href: "/settings", icon: Settings, labelKey: "settings" as const, tourId: "settings" },
] as const;
