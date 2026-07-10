import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Empty({
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4 text-center">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        {description ? <p className="text-xs text-muted-foreground/80">{description}</p> : null}
      </div>
      {onAction && actionLabel ? (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : actionHref && actionLabel ? (
        <Button asChild variant="outline" size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
