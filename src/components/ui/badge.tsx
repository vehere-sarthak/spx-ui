import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        critical: "border-severity-critical/30 bg-severity-critical/15 text-severity-critical",
        high: "border-severity-high/30 bg-severity-high/15 text-severity-high",
        medium: "border-severity-medium/30 bg-severity-medium/15 text-severity-medium",
        low: "border-severity-low/30 bg-severity-low/15 text-severity-low",
        info: "border-severity-info/30 bg-severity-info/15 text-severity-info",
        success: "border-severity-success/30 bg-severity-success/15 text-severity-success",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
