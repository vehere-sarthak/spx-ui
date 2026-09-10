"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fixed-height page frame: body scrolls internally.
 *
 * The page name lives in the shell's breadcrumb, so `title` is rendered for
 * assistive tech only — repeating it on screen costs a row and says nothing.
 * `meta` is live context (counts, load state) and shares the action row.
 */
export function PageFrame({
  title,
  meta,
  actions,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasBar = Boolean(meta || actions);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        hasBar && "gap-3",
        className,
      )}
    >
      <h1 className="sr-only">{title}</h1>
      {hasBar && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
          {meta && (
            <div className="hidden min-w-0 items-center gap-2 truncate text-xs text-muted-foreground md:flex">
              {meta}
            </div>
          )}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
