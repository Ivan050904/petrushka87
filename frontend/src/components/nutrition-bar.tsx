import { cn } from "@/lib/utils";

type NutritionBarProps = {
  label: string;
  value: number;
  target: number;
  className: string;
  compact?: boolean;
};

export function NutritionBar({ label, value, target, className, compact = false }: NutritionBarProps) {
  const safeTarget = target > 0 ? target : 1;
  const percent = Math.min(100, Math.round((value / safeTarget) * 100));
  const left = Math.max(0, target - value);
  const over = Math.max(0, value - target);

  return (
    <div>
      <div className={cn("mb-1 flex items-center justify-between gap-2", compact ? "text-sm" : "text-sm")}>
        <span className="font-medium">{label}</span>
        <span className="text-right text-muted-foreground">
          {Math.round(value)}/{target}
          {!compact && (over > 0 ? ` · +${Math.round(over)}` : ` · −${Math.round(left)}`)}
        </span>
      </div>
      <div
        className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-2" : "h-2")}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={cn("h-full rounded-full", over > 0 ? "bg-destructive" : className)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
