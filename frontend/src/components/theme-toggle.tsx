"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Until mounted, always render the light-default UI so SSR matches the server.
  const isDark = mounted && resolvedTheme === "dark";

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("focus-ring size-9 shrink-0", className)}
        aria-label={isDark ? "Светлая тема" : "Тёмная тема"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      </Button>
    );
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Button
        type="button"
        variant={!isDark ? "default" : "outline"}
        className="flex-1 gap-2"
        aria-pressed={!isDark}
        onClick={() => setTheme("light")}
      >
        <Sun aria-hidden="true" className="size-4" />
        Светлая
      </Button>
      <Button
        type="button"
        variant={isDark ? "default" : "outline"}
        className="flex-1 gap-2"
        aria-pressed={isDark}
        onClick={() => setTheme("dark")}
      >
        <Moon aria-hidden="true" className="size-4" />
        Тёмная
      </Button>
    </div>
  );
}
