import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The status ramp, shared by every back-office surface.
 *
 * One pair per lifecycle state so `queued` looks identical whether it is a
 * moderation job, a social post or an intake — an operator learns the colour
 * once. Status is NEVER colour alone: every badge carries its text label,
 * because sky/indigo and rose/amber are exactly the pairs that fail for
 * red-green colour blindness.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.01em] whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        neutral: "bg-slate-100 text-slate-700",
        queued: "bg-sky-100 text-sky-800",
        running: "bg-indigo-100 text-indigo-800",
        ok: "bg-emerald-100 text-emerald-800",
        warn: "bg-amber-100 text-amber-900",
        danger: "bg-rose-100 text-rose-800",
        inert: "bg-slate-200 text-slate-700",
        outline: "border border-slate-200 bg-white text-slate-700"
      }
    },
    defaultVariants: {
      variant: "neutral"
    }
  }
);

/**
 * Lifecycle value → ramp tone. Covers listing_status, moderation_status,
 * social_post_status and whatsapp_intake_status in one table, which is the
 * point: the same word means the same colour on every screen.
 */
const STATUS_TONE: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  // shared
  queued: "queued",
  running: "running",
  error: "warn",
  failed: "danger",
  skipped: "inert",
  // moderation
  passed: "ok",
  held: "danger",
  // social
  posted: "ok",
  pulled: "inert",
  // intake
  received: "queued",
  needs_info: "warn",
  published: "ok",
  manual_review: "danger",
  rejected: "inert",
  // listing
  active: "ok",
  pending: "queued",
  rented: "inert",
  archived: "inert",
  expired: "warn"
};

export function statusTone(status: string): VariantProps<typeof badgeVariants>["variant"] {
  return STATUS_TONE[status] ?? "neutral";
}

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? SlotPrimitive.Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

/**
 * A status badge with a fixed min-width so pills form a clean column down a
 * list. Renders the raw lifecycle value with underscores as spaces, matching
 * what the screens showed before.
 */
function StatusBadge({
  status,
  className,
  ...props
}: React.ComponentProps<"span"> & { status: string }) {
  return (
    <Badge
      variant={statusTone(status)}
      className={cn("min-w-[4.5rem]", className)}
      {...props}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export { Badge, StatusBadge, badgeVariants };
