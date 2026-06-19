"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { type Locale, t, type TranslationKey } from "@/lib/i18n";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  translate: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("he");

  // Load locale from profile on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("language")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.language) setLocaleState(data.language as Locale);
        });
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "he" ? "rtl" : "ltr";
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
  }, [locale]);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "he" : "en");
  }, [locale, setLocale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      translate: (key: TranslationKey) => t(locale, key),
    }),
    [locale, setLocale, toggleLocale]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
