"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Fixed-height page frame: header stays put, body scrolls internally. */
export function PageFrame({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3 overflow-hidden", className)}>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
