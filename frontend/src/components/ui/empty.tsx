import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Empty({
  title,
  actionHref,
  actionLabel,
  onAction,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
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
