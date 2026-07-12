export function WeatherCardSkeleton() {
  return (
    <div className="weather-card animate-pulse p-4">
      <div className="h-4 w-24 rounded bg-[var(--weather-border)]" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-10 w-16 rounded bg-[var(--weather-border)]" />
          <div className="h-3 w-28 rounded bg-[var(--weather-border)]" />
        </div>
        <div className="size-10 rounded-full bg-[var(--weather-border)]" />
      </div>
      <div className="mt-4 h-3 w-32 rounded bg-[var(--weather-border)]" />
    </div>
  );
}
