"use client";

import { cn } from "@/lib/utils";

type Bucket = { key: string; count: number };

export function PriorityHeat({
  buckets,
  active,
  onSelect,
}: {
  buckets: Bucket[];
  active?: string | null;
  onSelect?: (key: string) => void;
}) {
  const order = ["critical", "high", "medium", "low", "info"];
  const map = new Map(buckets.map((b) => [b.key.toLowerCase(), b.count]));
  const rows = order
    .map((key) => ({ key, count: map.get(key) || 0 }))
    .filter((r) => r.count > 0);
  const max = Math.max(...rows.map((c) => c.count), 1);

  if (rows.length === 0) {
    return (
      <div className="ndr-panel p-3 text-xs text-muted-foreground">No priority aggregates from Elasticsearch</div>
    );
  }

  return (
    <div className="ndr-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Alert priority (from ES)
        </h3>
        <span className="text-[10px] text-muted-foreground">click to filter stream</span>
      </div>
      <div className={cn("grid gap-1.5", `grid-cols-${Math.min(rows.length, 5)}`)} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((c) => {
          const intensity = c.count / max;
          return (
            <button
              key={c.key}
              onClick={() => onSelect?.(c.key)}
              className={cn(
                "group relative overflow-hidden rounded-md border px-1 py-2 text-center transition",
                active === c.key ? "border-primary shadow-crimson" : "border-border/60 hover:border-primary/40"
              )}
              style={{
                background: `linear-gradient(180deg, hsl(354 86% 54% / ${0.08 + intensity * 0.35}) 0%, transparent 100%)`,
              }}
            >
              <div className="text-[10px] font-semibold capitalize">{c.key}</div>
              <div className="mt-1 font-mono text-lg font-bold leading-none">{c.count.toLocaleString()}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
