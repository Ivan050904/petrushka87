"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmDeleteButton({
  ariaLabel,
  confirmTitle,
  confirmDescription,
  onConfirm,
  pending = false,
  disabled = false,
  variant = "ghost",
  size = "sm",
  className,
  children,
}: {
  ariaLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
  disabled?: boolean;
  variant?: "ghost" | "outline" | "destructive";
  size?: "sm" | "icon" | "default";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn(className)}
          aria-label={ariaLabel}
          disabled={disabled || pending}
        >
          {children ?? <Trash2 aria-hidden="true" className="size-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? "Удаление…" : "Удалить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
