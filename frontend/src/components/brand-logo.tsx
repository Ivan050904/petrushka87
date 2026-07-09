import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 40, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" className="fill-primary" />
      <path
        d="M11 12.5C11 11.12 12.12 10 13.5 10h13c1.38 0 2.5 1.12 2.5 2.5v15c0 1.38-1.12 2.5-2.5 2.5h-13C12.12 30 11 28.88 11 27.5v-15Z"
        className="fill-primary-foreground/15"
      />
      <path
        d="M14 12.5h12v15H14v-15Z"
        className="fill-primary-foreground"
      />
      <path
        d="M20 12.5v15"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M15.5 16h3M15.5 19.5h4.5M15.5 23h3"
        className="stroke-primary"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="27.5" cy="27.5" r="5.5" className="fill-accent" />
      <path
        d="M27.5 25.2v4.6M25.2 27.5h4.6"
        className="stroke-accent-foreground"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type BrandWordmarkProps = {
  className?: string;
  showTagline?: boolean;
  compact?: boolean;
};

export function BrandWordmark({ className, showTagline = false, compact = false }: BrandWordmarkProps) {
  return (
    <div className={cn("flex flex-col", showTagline ? "items-center gap-2 text-center" : "gap-0.5", className)}>
      <p
        className={cn(
          "font-semibold tracking-tight text-foreground",
          compact ? "text-lg leading-none" : "text-3xl leading-none sm:text-4xl",
        )}
      >
        Folio<span className="text-primary">-One</span>
      </p>
      {showTagline ? (
        <p className={cn("max-w-sm text-muted-foreground", compact ? "text-xs" : "text-sm")}>{BRAND_TAGLINE}</p>
      ) : null}
      <span className="sr-only">{BRAND_NAME}</span>
    </div>
  );
}
