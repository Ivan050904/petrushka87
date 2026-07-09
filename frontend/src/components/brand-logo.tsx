import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      priority
    />
  );
}

export function BrandWordmark({ className, width = 200 }: { className?: string; width?: number }) {
  const height = Math.round(width * 0.28);
  return (
    <Image
      src="/brand/logo-wordmark.png"
      alt="LetsCore"
      width={width}
      height={height}
      className={cn("h-auto w-auto max-w-full", className)}
      priority
    />
  );
}
