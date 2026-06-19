import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

export function Logo({ collapsed = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <BrainCircuit className="h-5 w-5 text-primary" strokeWidth={2.25} />
      </div>
      {!collapsed && (
        <span className="text-lg font-bold tracking-tight text-foreground">
          Smart Study
        </span>
      )}
    </div>
  );
}
