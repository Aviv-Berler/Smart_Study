"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Moon, Pencil, Save, Sun, SunMoon, User, X } from "lucide-react";
import { useTheme } from "next-themes";
import { saveProfilePreferences } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/providers/language-provider";
import { useUser } from "@/components/providers/user-provider";
import { PlanningPreferencesForm } from "@/components/forms/planning-preferences-form";
import { cn } from "@/lib/utils";
import type { Profile, ThemeMode } from "@/types/database";
import type { Locale } from "@/lib/i18n";

interface Props {
  profile: Profile | null;
}

const THEME_VALUES: ThemeMode[] = ["light", "dark", "system"];
const THEME_ICONS: Record<ThemeMode, React.ElementType> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

// ─── Inline Name Editor ──────────────────────────────────────────────────────
/**
 * Decoupled read/edit widget for the display name.
 * It never tries to initialise a controlled <input> from server-rendered props,
 * which eliminates the entire class of SSR/hydration blank-field bugs.
 *
 *  Read mode  → plain text + Pencil button
 *  Edit mode  → <input> + Save + Cancel   (state only created on click)
 */
function NameField({ currentName }: { currentName: string }) {
  const router = useRouter();
  const { translate } = useLanguage();
  const { setProfile, profile: ctx } = useUser();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(currentName);
    setSaveError(null);
    setEditing(true);
    // Focus the input on the next paint
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancelEditing = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = () => {
    setSaveError(null);
    startSave(async () => {
      const res = await saveProfilePreferences({ full_name: draft.trim() });
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      // Update context so sidebar / header name updates immediately
      if (ctx) setProfile({ ...ctx, full_name: draft.trim() });
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      <Label>{translate("fullNameLabel")}</Label>

      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            placeholder={translate("fullNameLabel")}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") cancelEditing();
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            title="Save"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={saving}
            title="Cancel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate rounded-md border border-transparent px-3 py-2 text-sm font-medium">
            {currentName || (
              <span className="text-muted-foreground italic">User</span>
            )}
          </span>
          <button
            type="button"
            onClick={startEditing}
            title="Edit name"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {saveError && (
        <p className="text-xs text-destructive">{saveError}</p>
      )}
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────
export function PreferencesForm({ profile }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { setTheme } = useTheme();
  const { locale, setLocale, translate } = useLanguage();
  const { profile: contextProfile, setProfile } = useUser();

  // Use the live context profile (updated after saves) as the source of truth;
  // fall back to the server-rendered prop on first load.
  const effectiveProfile = contextProfile ?? profile;

  const [themeMode, setThemeMode] = useState<ThemeMode>(
    effectiveProfile?.theme_mode ?? "system"
  );

  // Apply theme / language from DB on initial mount only
  useEffect(() => {
    const src = contextProfile ?? profile;
    if (src?.theme_mode) {
      setThemeMode(src.theme_mode);
      setTheme(src.theme_mode);
    }
    if (src?.language) setLocale(src.language as Locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);                               // ← intentionally empty — run once on mount

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    setTheme(mode);
  };

  const handleAppearanceSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAppearanceError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveProfilePreferences({
        theme_mode: themeMode,
        language: locale,
      });

      if (result.error) {
        setAppearanceError(result.error);
      } else {
        if (effectiveProfile) {
          setProfile({ ...effectiveProfile, theme_mode: themeMode, language: locale });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    });
  };

  const themeLabels: Record<ThemeMode, string> = {
    light: translate("lightTheme"),
    dark: translate("darkTheme"),
    system: translate("systemTheme"),
  };

  return (
    <div className="space-y-5">
      {/* ── Profile ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            {translate("profileSection")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name: completely independent read/edit widget — no hydration issues */}
          <NameField currentName={effectiveProfile?.full_name || ""} />

          <div className="space-y-1.5">
            <Label>{translate("emailLabel")}</Label>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {effectiveProfile?.email ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {translate("emailManagedByAuth")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Planning Preferences ────────────────────────────────────── */}
      <PlanningPreferencesForm profile={effectiveProfile} />

      {/* ── Appearance ──────────────────────────────────────────────── */}
      <form onSubmit={handleAppearanceSave} className="space-y-5">
        {appearanceError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {appearanceError}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sun className="h-4 w-4 text-primary" />
              {translate("appearanceSection")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Theme */}
            <div className="space-y-2">
              <Label>{translate("themeLabel")}</Label>
              <div className="flex gap-2">
                {THEME_VALUES.map((value) => {
                  const Icon = THEME_ICONS[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleThemeChange(value)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors",
                        themeMode === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {themeLabels[value]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>{translate("languageLabel")}</Label>
              <div className="flex gap-2">
                {(["en", "he"] as Locale[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLocale(lang)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                      locale === lang
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {lang === "en" ? "English" : "עברית"}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {translate("savingLabel")}
            </>
          ) : saved ? (
            <>{translate("savedMsg")}</>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {translate("savePreferences")}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
