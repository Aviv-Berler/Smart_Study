"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Profile } from "@/types/database";

interface UserContextValue {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  initialProfile,
  children,
}: {
  initialProfile: Profile | null;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);

  // Re-sync when the server layout re-fetches and passes a fresh initialProfile
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  return (
    <UserContext.Provider value={{ profile, setProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
