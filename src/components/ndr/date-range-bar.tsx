"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { id: "now-15m", label: "15m" },
  { id: "now-1h", label: "1h" },
  { id: "now-6h", label: "6h" },
  { id: "now-8h", label: "8h" },
  { id: "now-1d", label: "24h" },
  { id: "now-7d", label: "7d" },
  { id: "now-30d", label: "30d" },
  { id: "custom", label: "Custom" },
] as const;

export type DateRangeValue = {
  preset: string;
  startTime: string;
  endTime: string;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateRangeBar({
  value,
  onChange,
  presets,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  presets?: typeof PRESETS[number]["id"][];
}) {
  const list = PRESETS.filter((p) => !presets || presets.includes(p.id));
  const [customStart, setCustomStart] = React.useState(() =>
    toLocalInput(new Date(Date.now() - 24 * 3600_000))
  );
  const [customEnd, setCustomEnd] = React.useState(() => toLocalInput(new Date()));

  function setPreset(id: string) {
    if (id === "custom") {
      onChange({
        preset: "custom",
        startTime: new Date(customStart).toISOString(),
        endTime: new Date(customEnd).toISOString(),
      });
      return;
    }
    onChange({ preset: id, startTime: id, endTime: "now" });
  }

  function applyCustom() {
    onChange({
      preset: "custom",
      startTime: new Date(customStart).toISOString(),
      endTime: new Date(customEnd).toISOString(),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onValueChange={setPreset}>
        <SelectTrigger className="w-[110px]">
          <SelectValue placeholder="Range" />
        </SelectTrigger>
        <SelectContent>
          {list.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === "custom" && (
        <>
          <Input
            type="datetime-local"
            className="w-[190px]"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="datetime-local"
            className="w-[190px]"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={applyCustom}>
            Apply
          </Button>
        </>
      )}
    </div>
  );
}

export function useDateRange(defaultPreset = "now-1d"): [DateRangeValue, (v: DateRangeValue) => void] {
  const [value, setValue] = React.useState<DateRangeValue>({
    preset: defaultPreset,
    startTime: defaultPreset,
    endTime: "now",
  });
  return [value, setValue];
}
