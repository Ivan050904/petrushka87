"use client";

import { forwardRef, useRef, type ForwardedRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SegmentTabs<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel = "Разделы",
  size = "default",
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
  size?: "default" | "compact";
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const tab = tabRefs.current[index];
    tab?.focus();
    onChange(options[index].value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = options.findIndex((option) => option.value === value);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTab((currentIndex + 1) % options.length);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTab((currentIndex - 1 + options.length) % options.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusTab(options.length - 1);
    }
  }

  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-border bg-muted p-1",
        size === "compact" && "gap-1 p-0.5",
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => (
        <TabButton
          key={option.value}
          ref={(node) => {
            tabRefs.current[index] = node;
          }}
          active={value === option.value}
          size={size}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </TabButton>
      ))}
    </div>
  );
}

const TabButton = forwardRef(function TabButton(
  {
    children,
    active,
    onClick,
    size = "default",
  }: {
    children: ReactNode;
    active: boolean;
    onClick: () => void;
    size?: "default" | "compact";
  },
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        "focus-ring rounded-md font-medium transition",
        size === "compact" ? "min-h-8 px-2.5 text-xs" : "min-h-10 px-3 text-sm",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
});
