"use client";

import { BookOpen, CalendarDays, PanelLeft } from "lucide-react";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useLanguage } from "@/components/providers/language-provider";
import { useUser } from "@/components/providers/user-provider";
import { Button } from "@/components/ui/button";
import { AutoDirText } from "@/components/ui/bidi-text";
import type { TranslationKey } from "@/lib/i18n";

interface AppHeaderProps {
  title?: string;
  titleKey?: TranslationKey;
  subtitle?: string;
  subtitleKey?: TranslationKey;
}

function formatToday(locale: "en" | "he"): string {
  return new Date().toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function AppHeader({
  title,
  titleKey,
  subtitle,
  subtitleKey,
}: AppHeaderProps) {
  const { toggleCollapsed } = useSidebar();
  const { locale, translate } = useLanguage();
  const { profile } = useUser();
  const { openGuide } = useOnboarding();

  const displayTitle = title ?? (titleKey ? translate(titleKey) : undefined);
  const displaySubtitle =
    subtitle ?? (subtitleKey ? translate(subtitleKey) : undefined);

  // Show first name only (or email prefix)
  const firstName =
    profile?.full_name?.split(" ")[0] ||
    profile?.email?.split("@")[0] ||
    null;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={toggleCollapsed}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        {(displayTitle || displaySubtitle) && (
          <div className="min-w-0">
            {displayTitle && (
              <h1 className="truncate text-base font-semibold">
                {displayTitle}
                {firstName && titleKey === "dashboard" && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    <span className="inline-flex flex-row items-center gap-1">
                      <span>{translate("helloUser")},</span>
                      <AutoDirText>{firstName}</AutoDirText>
                    </span>
                  </span>
                )}
              </h1>
            )}
            {displaySubtitle && (
              <p className="truncate text-xs text-muted-foreground">
                {displaySubtitle}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{formatToday(locale)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 gap-1.5 sm:inline-flex"
          onClick={openGuide}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>{translate("guideButton")}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 sm:hidden"
          onClick={openGuide}
          aria-label={translate("guideButton")}
        >
          <BookOpen className="h-4 w-4" />
        </Button>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
