import * as React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type NoticeVariant = "info" | "success" | "error";

const variants: Record<NoticeVariant, string> = {
  info: "border-border bg-muted/40 text-muted-foreground",
  success: "border-primary/30 bg-primary/10 text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function Notice({
  children,
  className,
  variant = "info",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: NoticeVariant;
  id?: string;
}) {
  const Icon = variant === "error" ? AlertTriangle : variant === "success" ? CheckCircle2 : Info;

  return (
    <div
      id={id}
      className={cn(
        "flex min-h-10 items-start gap-3 rounded-md border px-3 py-2 text-sm leading-6",
        variants[variant],
        className,
      )}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
