"use client";

import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { cn } from "@/lib/utils";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

const CollapsibleContentAnimated = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.Content ref={ref} className={cn("overflow-hidden", className)} {...props}>
    {children}
  </CollapsiblePrimitive.Content>
));
CollapsibleContentAnimated.displayName = "CollapsibleContentAnimated";

export { Collapsible, CollapsibleContent, CollapsibleContentAnimated, CollapsibleTrigger };
