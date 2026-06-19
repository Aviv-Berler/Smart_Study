// Force every request to fetch a fresh profile from Supabase — never serve
// a cached (stale) version of this page.
export const dynamic = "force-dynamic";

import { AppHeader } from "@/components/layout/app-header";
import { PreferencesForm } from "@/components/forms/preferences-form";
import { getProfile } from "@/app/actions/profile";

export default async function SettingsPage() {
  const profile = await getProfile();
  return (
    <>
      <AppHeader titleKey="settingsTitle" subtitleKey="settingsDesc" />
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-lg">
          <PreferencesForm profile={profile} />
        </div>
      </div>
    </>
  );
}
