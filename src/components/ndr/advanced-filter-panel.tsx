"use client";

import * as React from "react";
import { ChevronDown, Filter, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterOption = {
  key: string;
  label: string;
  count?: number;
};

export type FilterGroup = {
  id: string;
  label: string;
  options: FilterOption[];
  /** multi-select values; empty / ['all'] = no filter */
  selected: string[];
  onChange: (values: string[]) => void;
  multi?: boolean;
};

export type AdvancedRule = {
  id: string;
  field: string;
  condition: string;
  value: string;
};

export type AdvancedField = {
  id: string;
  label: string;
  /** Typed input — drives conditions + value widget (vehere-ui AdvanceFilter parity) */
  type?: "text" | "ip" | "port" | "number" | "protocol" | "keyword";
};

const CONDITIONS_BY_TYPE: Record<string, { id: string; label: string }[]> = {
  text: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is not" },
    { id: "contains", label: "contains" },
    { id: "not_contains", label: "does not contain" },
    { id: "starts_with", label: "starts with" },
    { id: "exists", label: "exists" },
    { id: "not_exists", label: "does not exist" },
  ],
  keyword: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is not" },
    { id: "is_one_of", label: "is one of" },
    { id: "exists", label: "exists" },
    { id: "not_exists", label: "does not exist" },
  ],
  ip: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is not" },
    { id: "cidr", label: "in CIDR" },
    { id: "exists", label: "exists" },
    { id: "not_exists", label: "does not exist" },
  ],
  port: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is not" },
    { id: "gt", label: ">" },
    { id: "gte", label: "≥" },
    { id: "lt", label: "<" },
    { id: "lte", label: "≤" },
    { id: "exists", label: "exists" },
  ],
  number: [
    { id: "is", label: "is" },
    { id: "gt", label: ">" },
    { id: "gte", label: "≥" },
    { id: "lt", label: "<" },
    { id: "lte", label: "≤" },
    { id: "exists", label: "exists" },
  ],
  protocol: [
    { id: "is", label: "is" },
    { id: "is_not", label: "is not" },
    { id: "is_one_of", label: "is one of" },
  ],
};

const PROTOCOLS = ["tcp", "udp", "icmp", "http", "https", "dns", "smtp", "ftp", "ssh", "tls", "quic"];


function toggleValue(selected: string[], value: string, multi = true): string[] {
  if (value === "all") return ["all"];
  const withoutAll = selected.filter((v) => v !== "all");
  if (!multi) return [value];
  if (withoutAll.includes(value)) {
    const next = withoutAll.filter((v) => v !== value);
    return next.length ? next : ["all"];
  }
  return [...withoutAll, value];
}

/** Left drawer: facet checkboxes + optional advanced field/condition/value rules (vehere-ui AdvanceFilter functionality). */
export function AdvancedFilterPanel({
  open,
  onOpenChange,
  groups,
  advancedFields,
  rules,
  onRulesChange,
  onApply,
  onReset,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: FilterGroup[];
  advancedFields?: AdvancedField[];
  rules?: AdvancedRule[];
  onRulesChange?: (rules: AdvancedRule[]) => void;
  onApply?: () => void;
  onReset?: () => void;
  className?: string;
}) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="ndr-panel flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-primary"
        title="Advanced filters"
      >
        <Filter className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-full w-[260px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Filter className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide">Filters</span>
        <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => onOpenChange(false)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2 scroll-thin">
        {groups.map((g) => {
          const isClosed = collapsed[g.id];
          const selected = g.selected?.length ? g.selected : ["all"];
          return (
            <div key={g.id} className="rounded-md border border-border/50">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-medium"
                onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition", isClosed && "-rotate-90")} />
                {g.label}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {selected.includes("all") ? "All" : selected.length}
                </span>
              </button>
              {!isClosed && (
                <div className="space-y-0.5 border-t border-border/40 px-2 py-1.5">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11px] hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selected.includes("all")}
                      onChange={() => g.onChange(["all"])}
                    />
                    <span className="flex-1">All</span>
                  </label>
                  {g.options.map((o) => (
                    <label
                      key={o.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11px] hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={!selected.includes("all") && selected.includes(o.key)}
                        onChange={() => g.onChange(toggleValue(selected, o.key, g.multi !== false))}
                      />
                      <span className="min-w-0 flex-1 truncate" title={o.label}>
                        {o.label}
                      </span>
                      {o.count != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">{o.count}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {advancedFields && onRulesChange && (
          <div className="rounded-md border border-border/50">
            <div className="px-2.5 py-2 text-xs font-medium">Advanced</div>
            <div className="space-y-2 border-t border-border/40 p-2">
              {(rules || []).map((rule) => {
                const fieldMeta = advancedFields.find((f) => f.id === rule.field);
                const fType = fieldMeta?.type || "text";
                const conds = CONDITIONS_BY_TYPE[fType] || CONDITIONS_BY_TYPE.text;
                return (
                  <div key={rule.id} className="space-y-1 rounded-md bg-muted/30 p-2">
                    <Select
                      value={rule.field || undefined}
                      onValueChange={(v) => {
                        const nextType = advancedFields.find((f) => f.id === v)?.type || "text";
                        const nextConds = CONDITIONS_BY_TYPE[nextType] || CONDITIONS_BY_TYPE.text;
                        onRulesChange(
                          (rules || []).map((r) =>
                            r.id === rule.id
                              ? { ...r, field: v, condition: nextConds[0]?.id || "is", value: "" }
                              : r
                          )
                        );
                      }}
                    >
                      <SelectTrigger className="h-8 text-[11px]">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {advancedFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                            {f.type && f.type !== "text" ? ` · ${f.type}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={rule.condition || conds[0]?.id}
                      onValueChange={(v) =>
                        onRulesChange((rules || []).map((r) => (r.id === rule.id ? { ...r, condition: v } : r)))
                      }
                    >
                      <SelectTrigger className="h-8 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {conds.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!["exists", "not_exists"].includes(rule.condition) &&
                      (fType === "protocol" ? (
                        <Select
                          value={rule.value || undefined}
                          onValueChange={(v) =>
                            onRulesChange((rules || []).map((r) => (r.id === rule.id ? { ...r, value: v } : r)))
                          }
                        >
                          <SelectTrigger className="h-8 text-[11px]">
                            <SelectValue placeholder="Protocol" />
                          </SelectTrigger>
                          <SelectContent>
                            {PROTOCOLS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-8 text-[11px]"
                          type={fType === "port" || fType === "number" ? "number" : "text"}
                          placeholder={
                            fType === "ip"
                              ? rule.condition === "cidr"
                                ? "e.g. 10.0.0.0/24"
                                : "e.g. 10.0.0.20"
                              : fType === "port"
                                ? "1–65535"
                                : fType === "keyword" && rule.condition === "is_one_of"
                                  ? "a,b,c"
                                  : "Value"
                          }
                          value={rule.value}
                          onChange={(e) =>
                            onRulesChange((rules || []).map((r) => (r.id === rule.id ? { ...r, value: e.target.value } : r)))
                          }
                        />
                      ))}
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                      onClick={() => onRulesChange((rules || []).filter((r) => r.id !== rule.id))}
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                );
              })}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  const f = advancedFields[0];
                  const t = f?.type || "text";
                  const conds = CONDITIONS_BY_TYPE[t] || CONDITIONS_BY_TYPE.text;
                  onRulesChange([
                    ...(rules || []),
                    {
                      id: `r-${Date.now()}`,
                      field: f?.id || "",
                      condition: conds[0]?.id || "is",
                      value: "",
                    },
                  ]);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add condition
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border/60 p-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onReset}>
          Reset
        </Button>
        <Button size="sm" className="flex-1" onClick={onApply}>
          Apply
        </Button>
      </div>
    </aside>
  );
}

/** Encode advanced rules for API query string */
export function rulesToQuery(rules: AdvancedRule[]): string {
  return rules
    .filter((r) => r.field && (r.value || ["exists", "not_exists"].includes(r.condition)))
    .map((r) => `${r.field}:${r.condition}:${encodeURIComponent(r.value || "")}`)
    .join("|");
}

export function selectedParam(values: string[]): string {
  if (!values?.length || values.includes("all")) return "all";
  return values.join(",");
}
