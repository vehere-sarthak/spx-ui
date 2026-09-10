"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type AboutData = {
  productName?: string;
  productDetails?: any;
  license?: any;
  entitlement?: any;
  software?: any;
  system?: any;
  environment?: any;
};

export default function AboutPage() {
  const [data, setData] = React.useState<AboutData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({
    license: true,
    entitlement: true,
    software: false,
    system: false,
    environment: false,
  });

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/about", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const status = data?.license?.status || "-";
  const statusTone =
    status === "Active" ? "text-emerald-400" : status === "Expired" ? "text-primary" : "text-muted-foreground";

  return (
    <PageFrame title="About">
      <div className="h-full min-h-0 overflow-auto scroll-thin">
        {error && (
          <div className="mb-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.2 6.5 3.6v7.4L12 19.8 5.5 15.2V7.8L12 4.2z" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">{data?.productName || "Vehere Spider-X"}</div>
            <div className="text-xs text-muted-foreground">
              Version {data?.software?.version || "—"} (Build {data?.software?.build || "—"})
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="License status" value={status} valueClass={statusTone} />
          <SummaryCard label="License capacity" value={data?.license?.capacity || "—"} />
          <SummaryCard
            label="Software"
            value={`${data?.software?.version || "—"} (${data?.software?.build || "—"})`}
          />
          <SummaryCard label="Support status" value={status} valueClass={statusTone} />
        </div>

        <div className="space-y-2">
          <Accordion
            title="License"
            open={!!open.license}
            onToggle={() => setOpen((o) => ({ ...o, license: !o.license }))}
          >
            <Rows
              items={[
                ["Licensed to", data?.license?.licensedTo],
                ["Licensed capacity", data?.license?.capacity],
                ["License key", data?.license?.licenseKey],
                ["License installation date", data?.license?.installationDate],
                ["License expiry date", data?.license?.expiryDate],
                ["Days to expire", data?.license?.daysToExpire],
              ]}
            />
          </Accordion>

          <Accordion
            title="Entitlement"
            open={!!open.entitlement}
            onToggle={() => setOpen((o) => ({ ...o, entitlement: !o.entitlement }))}
          >
            <Rows
              items={[
                ["Subscription status", data?.entitlement?.subscriptionStatus],
                ["Auto renewal", data?.entitlement?.autoRenewal],
                ["Software updates", data?.entitlement?.softwareUpdates],
                ["Technical support", data?.entitlement?.technicalSupport],
              ]}
            />
          </Accordion>

          <Accordion
            title="Software"
            open={!!open.software}
            onToggle={() => setOpen((o) => ({ ...o, software: !o.software }))}
          >
            <Rows
              items={[
                ["Version", data?.software?.version],
                ["Build", data?.software?.build],
                ["Release date", data?.software?.releaseDate],
              ]}
            />
          </Accordion>

          <Accordion
            title="System"
            open={!!open.system}
            onToggle={() => setOpen((o) => ({ ...o, system: !o.system }))}
          >
            <Rows
              items={[
                ["Hostname", data?.system?.hostname],
                ["Model", data?.system?.model],
                ["Serial number", data?.system?.serialNumber],
                ["Deployment mode", data?.system?.deploymentMode],
                ["Management IP", data?.system?.managementIp],
                ["Uptime", data?.system?.uptime],
              ]}
            />
          </Accordion>

          <Accordion
            title="Environment"
            open={!!open.environment}
            onToggle={() => setOpen((o) => ({ ...o, environment: !o.environment }))}
          >
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Elasticsearch</span>
              <Badge variant={data?.environment?.elasticsearch?.ok ? "success" : "critical"}>
                {data?.environment?.elasticsearch?.ok ? "ok" : "down"}
              </Badge>
            </div>
            <Rows
              items={[
                ["ES host", data?.environment?.elasticsearch?.host],
                ["ES cluster", data?.environment?.elasticsearch?.cluster],
                ["ES version", data?.environment?.elasticsearch?.version],
                ["MySQL host", data?.environment?.mysql?.host],
                ["MySQL database", data?.environment?.mysql?.database],
                ["Users", String(data?.environment?.mysql?.users ?? "—")],
                ["Roles", String(data?.environment?.mysql?.roles ?? "—")],
                ["SPX appliances", String(data?.environment?.mysql?.appliances ?? "—")],
                ["Capture ifaces", String(data?.environment?.capture_ifaces ?? "—")],
              ]}
            />
          </Accordion>
        </div>
      </div>
    </PageFrame>
  );
}

function SummaryCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3.5 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-base font-semibold", valueClass)}>{value}</div>
    </div>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold"
      >
        {title}
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border/50 px-3.5 py-2">{children}</div>}
    </div>
  );
}

function Rows({ items }: { items: [string, string | undefined][] }) {
  return (
    <div className="text-xs">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
          <span className="text-muted-foreground">{k}</span>
          <span className="max-w-[60%] truncate text-right font-medium" title={v || "—"}>
            {v || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
