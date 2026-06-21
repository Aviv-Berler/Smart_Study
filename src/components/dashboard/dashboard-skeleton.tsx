import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardPageSkeleton() {
  return (
    <>
      <AppHeader titleKey="dashboard" subtitle="…" />

      <div className="space-y-8 p-4 sm:p-6 max-md:min-w-0 max-md:w-full max-md:overflow-x-hidden">
        <div className="flex gap-3 overflow-hidden">
          <Skeleton className="h-28 w-60 shrink-0" />
          <Skeleton className="h-28 w-60 shrink-0" />
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Card>
            <CardContent className="space-y-0 divide-y divide-border p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="h-7 w-16 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </section>
      </div>
    </>
  );
}
