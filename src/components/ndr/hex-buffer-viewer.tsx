"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Hex buffer viewer (vehere-ui BufferViewer functional equivalent). */
export function HexBufferViewer({
  hex,
  className,
}: {
  hex?: string;
  className?: string;
}) {
  const clean = String(hex || "").replace(/\s+/g, "").toLowerCase();
  const bytes = React.useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i + 1 < clean.length; i += 2) {
      out.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return out;
  }, [clean]);

  if (!bytes.length) {
    return <p className="text-xs text-muted-foreground">No hexdump / PCAP payload on this frame</p>;
  }

  const rows: { offset: string; hex: string; ascii: string }[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const hexPart = slice
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(16 * 3 - 1, " ");
    const ascii = slice.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    rows.push({ offset: i.toString(16).padStart(8, "0"), hex: hexPart, ascii });
  }

  return (
    <div className={cn("overflow-auto rounded-md border border-border/60 bg-black/90 p-2 font-mono text-[10px] text-emerald-400/90 scroll-thin", className)}>
      <div className="mb-1 text-[10px] text-white/40">{bytes.length} bytes</div>
      {rows.map((r) => (
        <div key={r.offset} className="flex gap-3 whitespace-pre">
          <span className="shrink-0 text-white/35">{r.offset}</span>
          <span className="min-w-[288px]">{r.hex}</span>
          <span className="text-sky-300/80">{r.ascii}</span>
        </div>
      ))}
    </div>
  );
}

export function DecodeTree({ details }: { details: any }) {
  const nodes = Array.isArray(details) ? details : details ? [details] : [];
  if (!nodes.length) return <p className="text-xs text-muted-foreground">No decode tree</p>;
  return (
    <div className="space-y-1 text-[11px]">
      {nodes.map((n, i) => (
        <DecodeNode key={i} node={n} depth={0} />
      ))}
    </div>
  );
}

function DecodeNode({ node, depth }: { node: any; depth: number }) {
  const [open, setOpen] = React.useState(depth < 2);
  const kids = node?.fields || node?.children || [];
  const label = node?.showname || node?.name || JSON.stringify(node).slice(0, 80);
  return (
    <div style={{ paddingLeft: depth * 10 }}>
      <button
        type="button"
        className="flex w-full items-start gap-1 text-left hover:text-primary"
        onClick={() => setOpen((v) => !v)}
      >
        {kids.length ? <span className="text-muted-foreground">{open ? "▾" : "▸"}</span> : <span className="w-2" />}
        <span className="font-mono">{label}</span>
      </button>
      {open &&
        kids.map((c: any, i: number) => (
          <DecodeNode key={i} node={c} depth={depth + 1} />
        ))}
    </div>
  );
}
