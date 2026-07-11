import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function LoadError({
  message,
  onRetry,
  retryLabel = "Повторить",
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Notice variant="error">{message}</Notice>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
