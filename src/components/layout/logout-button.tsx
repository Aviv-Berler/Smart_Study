"use client";

import { useTransition } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

export function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const { translate } = useLanguage();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await logout();
    });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      title={translate("logOut")}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
        "text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
        "disabled:pointer-events-none disabled:opacity-50",
        collapsed && "justify-center px-0"
      )}
    >
      {isPending ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <LogOut className="h-5 w-5 shrink-0" />
      )}
      {!collapsed && <span>{translate("logOut")}</span>}
    </button>
  );
}
