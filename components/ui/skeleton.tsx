import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Rendered at TRUE row height by the work lists so the
 * page does not reflow when real rows arrive.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-slate-200", className)}
      {...props}
    />
  );
}

export { Skeleton };
