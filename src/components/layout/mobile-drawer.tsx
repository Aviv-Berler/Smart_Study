"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/layout/logo";
import { LogoutButton } from "@/components/layout/logout-button";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useLanguage } from "@/components/providers/language-provider";
import { useUser } from "@/components/providers/user-provider";
import { cn } from "@/lib/utils";

/** Mobile-only drawer — completely separate from the desktop sidebar. */
export function MobileDrawer() {
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { translate, locale } = useLanguage();
  const { profile } = useUser();
  const isRtl = locale === "he";

  const displayName = profile?.full_name || profile?.email || null;
  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (profile?.email?.[0] ?? "?").toUpperCase();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <div className="block md:hidden">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-y-0 z-40 flex w-60 flex-col border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg transition-transform duration-300 ease-in-out",
          isRtl ? "right-0 border-l" : "left-0 border-r",
          mobileOpen
            ? "translate-x-0"
            : isRtl
              ? "translate-x-full"
              : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
          <Logo collapsed={false} />
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {NAV_ITEMS.map(({ href, icon: Icon, labelKey, tourId }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                data-tour={tourId}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{translate(labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border p-2">
          {displayName && (
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

          <LogoutButton collapsed={false} />
        </div>
      </aside>
    </div>
  );
}
