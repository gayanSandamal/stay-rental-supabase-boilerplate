"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-slate-300 bg-white shadow-xs outline-none transition-shadow",
        "focus-visible:ring-[3px] focus-visible:ring-teal-600/40 focus-visible:border-teal-600",
        "data-[state=checked]:border-teal-700 data-[state=checked]:bg-teal-700 data-[state=checked]:text-white",
        "data-[state=indeterminate]:border-teal-700 data-[state=indeterminate]:bg-teal-700 data-[state=indeterminate]:text-white",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {props.checked === "indeterminate" ? (
          <MinusIcon className="size-3.5" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
