"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { LogoutButton } from "@/components/layout/logout-button";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useLanguage } from "@/components/providers/language-provider";
import { useUser } from "@/components/providers/user-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebar();
  const { translate, locale } = useLanguage();
  const { profile } = useUser();

  const displayName = profile?.full_name || profile?.email || null;
  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (profile?.email?.[0] ?? "?").toUpperCase();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 z-40 hidden flex-col border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out md:flex",
        locale === "he" ? "right-0 border-l" : "left-0 border-r",
        collapsed ? "w-[4.5rem]" : "w-60",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <Logo collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ href, icon: Icon, labelKey, tourId }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              data-tour={tourId}
              title={collapsed ? translate(labelKey) : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{translate(labelKey)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout + Collapse */}
      <div className="space-y-1 border-t border-sidebar-border p-2">
        {displayName && !collapsed && (
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{displayName}</p>
              {profile?.full_name && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {profile.email}
                </p>
              )}
            </div>
          </div>
        )}
        {collapsed && (
          <div
            className="flex justify-center py-1.5"
            title={displayName ?? ""}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {initials}
            </div>
          </div>
        )}

        <LogoutButton collapsed={collapsed} />

        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={cn("w-full text-muted-foreground", collapsed && "h-9 w-9")}
          onClick={toggleCollapsed}
          title={
            collapsed
              ? translate("expandSidebar")
              : translate("collapseSidebar")
          }
        >
          {collapsed ? (
            locale === "he" ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : locale === "he" ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          {!collapsed && (
            <span className="text-sm">{translate("collapseSidebar")}</span>
          )}
        </Button>
      </div>
    </aside>
  );
}
