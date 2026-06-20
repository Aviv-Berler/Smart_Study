import {
  CalendarRange,
  ClipboardPen,
  Home,
  Settings,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", icon: Home, labelKey: "dashboard" as const, tourId: "dashboard" },
  { href: "/planner", icon: CalendarRange, labelKey: "futurePlanner" as const, tourId: "planner" },
  { href: "/manage", icon: ClipboardPen, labelKey: "manageTitle" as const, tourId: "input" },
  { href: "/settings", icon: Settings, labelKey: "settings" as const, tourId: "settings" },
] as const;
