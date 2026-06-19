import { cn } from "@/lib/utils";

/** Clock times, durations, percentages — always LTR */
export function LtrIsolate({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span dir="ltr" className={cn("inline-block [unicode-bidi:isolate]", className)}>
      {children}
    </span>
  );
}

/** User-generated titles, notes, prompts — direction follows content */
export function AutoDirText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span dir="auto" className={cn("[unicode-bidi:plaintext]", className)}>
      {children}
    </span>
  );
}

/** HH:MM – HH:MM without BiDi punctuation flips */
export function TimeRange({
  start,
  end,
  className,
}: {
  start: string;
  end: string;
  className?: string;
}) {
  return (
    <LtrIsolate
      className={cn(
        "inline-flex flex-row items-center gap-0.5 font-mono tabular-nums",
        className,
      )}
    >
      <span>{start}</span>
      <span aria-hidden="true">–</span>
      <span>{end}</span>
    </LtrIsolate>
  );
}

export function PercentValue({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <LtrIsolate
      className={cn(
        "inline-flex flex-row items-baseline gap-px font-mono tabular-nums shrink-0",
        className,
      )}
    >
      <span>{value}</span>
      <span>%</span>
    </LtrIsolate>
  );
}

export function FractionCounter({
  numerator,
  denominator,
  className,
}: {
  numerator: number;
  denominator: number;
  className?: string;
}) {
  return (
    <LtrIsolate
      className={cn(
        "inline-flex flex-row items-center gap-px font-mono tabular-nums",
        className,
      )}
    >
      <span>{numerator}</span>
      <span>/</span>
      <span>{denominator}</span>
    </LtrIsolate>
  );
}
