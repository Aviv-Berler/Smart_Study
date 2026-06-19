"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { locale } = useLanguage();
  const isRtl = locale === "he";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-all duration-300 ease-in-out",
          isRtl
            ? collapsed
              ? "mr-[4.5rem]"
              : "mr-60"
            : collapsed
              ? "ml-[4.5rem]"
              : "ml-60"
        )}
      >
        {children}
      </div>
    </div>
  );
}
