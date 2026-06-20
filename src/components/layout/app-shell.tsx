"use client";

import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { Sidebar } from "@/components/layout/sidebar";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { locale } = useLanguage();
  const isRtl = locale === "he";

  return (
    <div className="min-h-screen bg-background max-md:overflow-x-hidden">
      <Sidebar />
      <MobileDrawer />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-all duration-300 ease-in-out",
          "max-md:min-w-0 max-md:w-full max-md:overflow-x-hidden",
          isRtl
            ? collapsed
              ? "mr-0 md:mr-[4.5rem]"
              : "mr-0 md:mr-60"
            : collapsed
              ? "ml-0 md:ml-[4.5rem]"
              : "ml-0 md:ml-60",
        )}
      >
        {children}
      </div>
    </div>
  );
}
