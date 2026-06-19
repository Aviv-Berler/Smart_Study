"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

export function LanguageToggle() {
  const { locale, toggleLocale } = useLanguage();

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 gap-1.5 px-3 font-semibold"
      onClick={toggleLocale}
      aria-label="Toggle language"
    >
      <Languages className="h-4 w-4" />
      {locale === "en" ? "EN" : "HE"}
    </Button>
  );
}
