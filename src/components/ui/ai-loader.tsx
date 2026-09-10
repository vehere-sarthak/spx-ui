"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AiLoaderProps {
  /** Diameter of the ring, in px. */
  size?: number;
  /** Letters animate in sequence, one wave per pass. */
  text?: string;
  /**
   * Covers the viewport by default. Pass false to fill whatever box it sits
   * in — a card, a panel — rather than taking the whole screen.
   */
  fullscreen?: boolean;
  className?: string;
}

/**
 * Indeterminate loader: a ring lit from the inside by a rotating red sweep,
 * with the label pulsing letter by letter underneath it.
 *
 * The keyframes live in tailwind.config.ts alongside the app's other
 * animations rather than in a styled-jsx block, so the reds stay in one place
 * with the rest of the theme and the component works unchanged in a server
 * tree once marked client.
 */
export function AiLoader({
  size = 180,
  text = "Generating",
  fullscreen = true,
  className,
}: AiLoaderProps) {
  const letters = React.useMemo(() => text.split(""), [text]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text}
      className={cn(
        "flex items-center justify-center",
        fullscreen
          ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm"
          : "h-full w-full",
        className
      )}
    >
      <div
        className="relative flex select-none items-center justify-center"
        style={{ width: size, height: size }}
      >
        {letters.map((letter, index) => (
          <span
            key={index}
            aria-hidden
            className="inline-block animate-loader-letter text-sm font-medium tracking-wide text-foreground opacity-40"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {/* A space collapses in an inline-block, so hold its width. */}
            {letter === " " ? " " : letter}
          </span>
        ))}

        <div className="pointer-events-none absolute inset-0 animate-loader-ring rounded-full" />
      </div>
    </div>
  );
}

/**
 * Alias for the name the component ships under upstream, so a copy-pasted
 * `import { Component } from "@/components/ui/ai-loader"` keeps working.
 */
export const Component = AiLoader;

export default AiLoader;
